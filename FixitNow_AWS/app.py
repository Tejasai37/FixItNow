from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
import os
from datetime import datetime
import uuid
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv
import logging

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# AWS Configuration
AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')
USERS_TABLE = os.getenv('USERS_TABLE', 'fixitnow_user')
SERVICES_TABLE = os.getenv('SERVICES_TABLE', 'fixitnow_service')
SNS_TOPIC_ARN = os.getenv('SNS_TOPIC_ARN')

# Initialize AWS clients
try:
    dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
    users_table = dynamodb.Table(USERS_TABLE)
    services_table = dynamodb.Table(SERVICES_TABLE)
    sns_client = boto3.client('sns', region_name=AWS_REGION)
    logger.info("AWS services initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize AWS services: {e}")
    # Fallback to in-memory storage for development
    users_table = None
    services_table = None
    sns_client = None

# In-memory fallback databases
users_db = {}
services_db = {}

# Database helper functions
def create_user_in_db(username, password_hash, user_type):
    """Create user in DynamoDB or fallback storage"""
    user_data = {
        'username': username,
        'password': password_hash,
        'user_type': user_type,
        'created_at': datetime.now().isoformat()
    }
    
    if users_table:
        try:
            users_table.put_item(Item=user_data)
            logger.info(f"User {username} created in DynamoDB")
            return True
        except ClientError as e:
            logger.error(f"Error creating user in DynamoDB: {e}")
            # Fallback to in-memory
            users_db[username] = user_data
            return True
    else:
        users_db[username] = user_data
        return True

def get_user_from_db(username):
    """Get user from DynamoDB or fallback storage"""
    if users_table:
        try:
            response = users_table.get_item(Key={'username': username})
            return response.get('Item')
        except ClientError as e:
            logger.error(f"Error getting user from DynamoDB: {e}")
            return users_db.get(username)
    else:
        return users_db.get(username)

def create_service_in_db(service_data):
    """Create service in DynamoDB or fallback storage"""
    if services_table:
        try:
            services_table.put_item(Item=service_data)
            logger.info(f"Service {service_data['service_id']} created in DynamoDB")
            return True
        except ClientError as e:
            logger.error(f"Error creating service in DynamoDB: {e}")
            services_db[service_data['service_id']] = service_data
            return True
    else:
        services_db[service_data['service_id']] = service_data
        return True

def update_service_in_db(service_id, updates):
    """Update service in DynamoDB or fallback storage"""
    if services_table:
        try:
            # Build update expression
            update_expression = "SET "
            expression_attribute_values = {}
            
            for key, value in updates.items():
                update_expression += f"{key} = :{key}, "
                expression_attribute_values[f":{key}"] = value
            
            update_expression = update_expression.rstrip(', ')
            
            services_table.update_item(
                Key={'service_id': service_id},
                UpdateExpression=update_expression,
                ExpressionAttributeValues=expression_attribute_values
            )
            logger.info(f"Service {service_id} updated in DynamoDB")
            return True
        except ClientError as e:
            logger.error(f"Error updating service in DynamoDB: {e}")
            if service_id in services_db:
                services_db[service_id].update(updates)
            return True
    else:
        if service_id in services_db:
            services_db[service_id].update(updates)
        return True

def get_services_from_db(homeowner=None, service_provider=None, status=None):
    """Get services from DynamoDB or fallback storage"""
    if services_table:
        try:
            response = services_table.scan()
            services = response.get('Items', [])
            
            # Apply filters
            filtered_services = []
            for service in services:
                if homeowner and service.get('homeowner') != homeowner:
                    continue
                if service_provider:
                    if service.get('service_provider') != service_provider and not (
                        status == 'pending' and service.get('service_provider') is None
                    ):
                        continue
                if status and service.get('status') != status:
                    continue
                filtered_services.append(service)
            
            return filtered_services
        except ClientError as e:
            logger.error(f"Error getting services from DynamoDB: {e}")
            return list(services_db.values())
    else:
        services = list(services_db.values())
        # Apply same filtering logic for fallback
        filtered_services = []
        for service in services:
            if homeowner and service.get('homeowner') != homeowner:
                continue
            if service_provider:
                if service.get('service_provider') != service_provider and not (
                    status == 'pending' and service.get('service_provider') is None
                ):
                    continue
            if status and service.get('status') != status:
                continue
            filtered_services.append(service)
        return filtered_services

def get_service_by_id(service_id):
    """Get single service by ID"""
    if services_table:
        try:
            response = services_table.get_item(Key={'service_id': service_id})
            return response.get('Item')
        except ClientError as e:
            logger.error(f"Error getting service from DynamoDB: {e}")
            return services_db.get(service_id)
    else:
        return services_db.get(service_id)

def send_notification(message, subject="FixItNow Notification"):
    """Send SNS notification"""
    if sns_client and SNS_TOPIC_ARN:
        try:
            sns_client.publish(
                TopicArn=SNS_TOPIC_ARN,
                Message=message,
                Subject=subject
            )
            logger.info("SNS notification sent successfully")
        except ClientError as e:
            logger.error(f"Error sending SNS notification: {e}")
    else:
        logger.info(f"Notification (would be sent): {subject} - {message}")

# Sample data initialization for development
def initialize_sample_data():
    """Initialize sample data for development/testing"""
    # Create sample users
    sample_users = [
        {
            'username': 'john_homeowner',
            'password': generate_password_hash('password123'),
            'user_type': 'homeowner'
        },
        {
            'username': 'jane_provider',
            'password': generate_password_hash('password123'),
            'user_type': 'service_provider'
        }
    ]
    
    for user in sample_users:
        if not get_user_from_db(user['username']):
            create_user_in_db(user['username'], user['password'], user['user_type'])
    
    # Create sample services
    sample_services = [
        {
            'service_id': 'service_001',
            'homeowner': 'john_homeowner',
            'service_provider': 'jane_provider',
            'service': 'Kitchen Faucet Leak',
            'service_type': 'plumbing',
            'priority': 'high',
            'description': 'Kitchen faucet is leaking from the base. Water dripping constantly.',
            'preferred_date': datetime(2025, 6, 3).isoformat(),
            'start_date': datetime(2025, 6, 2, 14, 30).isoformat(),
            'cost': None,
            'status': 'in_progress',
            'duration': None,
            'rating': None,
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        },
        {
            'service_id': 'service_002',
            'homeowner': 'john_homeowner',
            'service_provider': 'jane_provider',
            'service': 'AC Unit Maintenance',
            'service_type': 'hvac',
            'priority': 'medium',
            'description': 'Regular maintenance check for AC unit before summer season.',
            'preferred_date': datetime(2025, 6, 4, 10, 0).isoformat(),
            'start_date': None,
            'cost': None,
            'status': 'scheduled',
            'duration': None,
            'rating': None,
            'created_at': datetime.now().isoformat(),
            'updated_at': datetime.now().isoformat()
        }
    ]
    
    for service in sample_services:
        if not get_service_by_id(service['service_id']):
            create_service_in_db(service)

# Authentication helper functions
def is_signed_in():
    return 'user_id' in session

def get_current_user():
    if is_signed_in():
        return get_user_from_db(session['user_id'])
    return None

def require_signin():
    def decorator(f):
        def wrapper(*args, **kwargs):
            if not is_signed_in():
                flash('Please sign in to access this page.', 'warning')
                return redirect(url_for('signin'))
            return f(*args, **kwargs)
        wrapper.__name__ = f.__name__
        return wrapper
    return decorator

# Service helper functions
def get_user_services(username, user_type):
    if user_type == 'homeowner':
        return get_services_from_db(homeowner=username)
    elif user_type == 'service_provider':
        assigned_services = get_services_from_db(service_provider=username)
        pending_services = get_services_from_db(status='pending')
        return assigned_services + [s for s in pending_services if s.get('service_provider') is None]
    return []

def create_service_request(homeowner, service_type, priority, description, preferred_date=None):
    service_id = f"service_{str(uuid.uuid4())[:8]}"
    
    service_request = {
        'service_id': service_id,
        'homeowner': homeowner,
        'service_provider': None,
        'service': f"{service_type.title()} Service Request",
        'service_type': service_type,
        'priority': priority,
        'description': description,
        'preferred_date': preferred_date.isoformat() if preferred_date else None,
        'start_date': None,
        'cost': None,
        'status': 'pending',
        'duration': None,
        'rating': None,
        'created_at': datetime.now().isoformat(),
        'updated_at': datetime.now().isoformat()
    }
    
    create_service_in_db(service_request)
    
    # Send notification
    send_notification(
        f"New service request created: {service_type} ({priority} priority) by {homeowner}",
        "New Service Request"
    )
    
    return service_id

def update_service_status(service_id, status, **kwargs):
    updates = {
        'status': status,
        'updated_at': datetime.now().isoformat()
    }
    updates.update(kwargs)
    
    success = update_service_in_db(service_id, updates)
    
    if success:
        service = get_service_by_id(service_id)
        if service:
            send_notification(
                f"Service {service_id} status updated to: {status}",
                "Service Status Update"
            )
    
    return success

# Routes (keeping the same structure as original)
@app.route('/')
def home():
    user = get_current_user()
    return render_template('home.html', user=user)

@app.route('/signin', methods=['GET', 'POST'])
def signin():
    if is_signed_in():
        user = get_current_user()
        if user and user['user_type'] == 'homeowner':
            return redirect(url_for('homeowner_dashboard'))
        else:
            return redirect(url_for('service_provider_dashboard'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        
        if not username or not password:
            flash('Please enter both username and password.', 'error')
            return render_template('signin.html')
        
        user = get_user_from_db(username)
        if not user:
            flash('Invalid username or password.', 'error')
            return render_template('signin.html')
        
        if not check_password_hash(user['password'], password):
            flash('Invalid username or password.', 'error')
            return render_template('signin.html')
        
        session['user_id'] = username
        session['user_type'] = user['user_type']
        flash(f'Welcome back, {username}!', 'success')
        
        if user['user_type'] == 'homeowner':
            return redirect(url_for('homeowner_dashboard'))
        else:
            return redirect(url_for('service_provider_dashboard'))
    
    return render_template('signin.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if is_signed_in():
        user = get_current_user()
        if user and user['user_type'] == 'homeowner':
            return redirect(url_for('homeowner_dashboard'))
        else:
            return redirect(url_for('service_provider_dashboard'))
    
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        confirm_password = request.form.get('confirm_password', '')
        user_type = request.form.get('user_type', '')
        
        # Validation logic (same as original)
        if not username or not password or not confirm_password or not user_type:
            flash('Please fill in all fields.', 'error')
            return render_template('signup.html')
        
        if len(username) < 3:
            flash('Username must be at least 3 characters long.', 'error')
            return render_template('signup.html')
        
        if len(password) < 6:
            flash('Password must be at least 6 characters long.', 'error')
            return render_template('signup.html')
        
        if password != confirm_password:
            flash('Passwords do not match.', 'error')
            return render_template('signup.html')
        
        if user_type not in ['homeowner', 'service_provider']:
            flash('Please select a valid user type.', 'error')
            return render_template('signup.html')
        
        if get_user_from_db(username):
            flash('Username already exists. Please choose a different one.', 'error')
            return render_template('signup.html')
        
        # Create user
        create_user_in_db(username, generate_password_hash(password), user_type)
        
        # Send notification
        send_notification(
            f"New user registered: {username} ({user_type})",
            "New User Registration"
        )
        
        flash('Account created successfully! Please sign in.', 'success')
        return redirect(url_for('signin'))
    
    return render_template('signup.html')

@app.route('/logout')
def logout():
    if is_signed_in():
        username = session.get('user_id', 'User')
        session.clear()
        flash(f'Goodbye, {username}! You have been signed out.', 'info')
    return redirect(url_for('home'))

# Dashboard routes
@app.route('/homeowner_dashboard')
def homeowner_dashboard():
    if not is_signed_in():
        flash('Please sign in to access your dashboard.', 'warning')
        return redirect(url_for('signin'))
    
    user = get_current_user()
    if not user or user['user_type'] != 'homeowner':
        flash('Access denied. This page is for homeowners only.', 'error')
        return redirect(url_for('home'))
    
    user_services = get_user_services(user['username'], 'homeowner')
    
    # Calculate stats
    total_requests = len(user_services)
    in_progress = len([s for s in user_services if s['status'] == 'in_progress'])
    completed = len([s for s in user_services if s['status'] == 'completed'])
    scheduled = len([s for s in user_services if s['status'] == 'scheduled'])
    
    stats = {
        'total_requests': total_requests,
        'in_progress': in_progress,
        'completed': completed,
        'scheduled': scheduled
    }
    
    return render_template('homeowner_dashboard.html', user=user, services=user_services, stats=stats)

@app.route('/service_provider_dashboard')
def service_provider_dashboard():
    if not is_signed_in():
        flash('Please sign in to access your dashboard.', 'warning')
        return redirect(url_for('signin'))
    
    user = get_current_user()
    if not user or user['user_type'] != 'service_provider':
        flash('Access denied. This page is for service providers only.', 'error')
        return redirect(url_for('home'))
    
    provider_services = get_user_services(user['username'], 'service_provider')
    
    stats = {
        'pending': len([s for s in provider_services if s['status'] == 'pending']),
        'in_progress': len([s for s in provider_services if s['status'] == 'in_progress']),
        'completed': len([s for s in provider_services if s['status'] == 'completed']),
        'total_earnings': sum(float(s.get('cost', 0) or 0) for s in provider_services if s['status'] == 'completed')
    }
    
    return render_template('service_provider_dashboard.html', 
                         user=user, 
                         services=provider_services,
                         stats=stats)

# API routes (keeping same structure, but using new database functions)
@app.route('/api/create-service-request', methods=['POST'])
def api_create_service_request():
    if not is_signed_in():
        return jsonify({'error': 'Not signed in'}), 401
    
    user = get_current_user()
    if not user or user['user_type'] != 'homeowner':
        return jsonify({'error': 'Only homeowners can create service requests'}), 403
    
    data = request.get_json()
    
    required_fields = ['service_type', 'priority', 'description']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'error': f'{field} is required'}), 400
    
    preferred_date = None
    if data.get('preferred_date'):
        try:
            date_str = data['preferred_date']
            if ' ' in date_str:
                preferred_date = datetime.strptime(date_str, '%Y-%m-%d %H:%M')
            else:
                preferred_date = datetime.strptime(date_str, '%Y-%m-%d')
        except ValueError:
            try:
                preferred_date = datetime.strptime(data['preferred_date'], '%d-%m-%Y')
            except ValueError:
                return jsonify({'error': 'Invalid date format. Expected YYYY-MM-DD'}), 400
    
    service_id = create_service_request(
        homeowner=user['username'],
        service_type=data['service_type'],
        priority=data['priority'],
        description=data['description'],
        preferred_date=preferred_date
    )
    
    return jsonify({
        'success': True,
        'service_id': service_id,
        'message': 'Service request created successfully'
    })

# Health check endpoint
@app.route('/health')
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'aws_services': {
            'dynamodb': users_table is not None and services_table is not None,
            'sns': sns_client is not None
        }
    })

# Template filters (same as original)
@app.template_filter('datetime')
def datetime_filter(value):
    if isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
            return dt.strftime('%Y-%m-%d %H:%M:%S')
        except:
            return value
    elif isinstance(value, datetime):
        return value.strftime('%Y-%m-%d %H:%M:%S')
    return value

@app.template_filter('currency')
def currency_filter(value):
    if value is None:
        return '-'
    try:
        return f"${float(value):.2f}"
    except (ValueError, TypeError):
        return '-'

@app.template_filter('duration')
def duration_filter(value):
    if value is None:
        return '-'
    try:
        hours = float(value)
        if hours < 1:
            minutes = int(hours * 60)
            return f"{minutes}min"
        else:
            return f"{hours:.1f}h"
    except (ValueError, TypeError):
        return '-'

@app.context_processor
def inject_user():
    return dict(current_user=get_current_user(), is_signed_in=is_signed_in())

if __name__ == '__main__':
    # Initialize sample data for development
    initialize_sample_data()
    
    
    print("FixItNow Flask App Starting...")
    app.run(debug=True, host='0.0.0.0', port=5000)
