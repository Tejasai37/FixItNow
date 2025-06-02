from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
import os
from datetime import datetime
import uuid
import boto3
from botocore.exceptions import ClientError
import json
from dotenv import load_dotenv
import logging
from decimal import Decimal

# Load environment variables
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# AWS Configuration
AWS_REGION = 'us-east-1'
USERS_TABLE = 'fixitnow_user'
SERVICES_TABLE = 'fixitnow_service'
SNS_TOPIC_ARN = os.getenv('SNS_TOPIC_ARN')

# Initialize AWS clients
try:
    dynamodb = boto3.resource('dynamodb', region_name=AWS_REGION)
    sns_client = boto3.client('sns', region_name=AWS_REGION)
    
    users_table = dynamodb.Table(USERS_TABLE)
    services_table = dynamodb.Table(SERVICES_TABLE)
    
    logger.info("AWS services initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize AWS services: {e}")
    raise

# Helper function to convert float to Decimal for DynamoDB
def float_to_decimal(value):
    """Convert float to Decimal for DynamoDB compatibility"""
    if isinstance(value, float):
        return Decimal(str(value))
    return value

# Helper function to convert datetime to string for DynamoDB
def serialize_datetime(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, Decimal):
        return float(obj)
    return obj

# Helper function to convert DynamoDB response to regular dict
def deserialize_item(item):
    if not item:
        return None
    
    result = {}
    for key, value in item.items():
        if isinstance(value, str) and 'T' in value:
            try:
                result[key] = datetime.fromisoformat(value)
            except ValueError:
                result[key] = value
        elif isinstance(value, Decimal):
            result[key] = float(value)
        else:
            result[key] = value
    return result

# SNS notification helper
def send_notification(message, subject="FixItNow Notification"):
    try:
        response = sns_client.publish(
            TopicArn=SNS_TOPIC_ARN,
            Message=message,
            Subject=subject
        )
        logger.info(f"SNS notification sent: {response['MessageId']}")
        return True
    except Exception as e:
        logger.error(f"Failed to send SNS notification: {e}")
        return False

# Database helper functions
def get_user_by_username(username):
    try:
        response = users_table.get_item(Key={'username': username})
        return deserialize_item(response.get('Item'))
    except ClientError as e:
        logger.error(f"Error getting user {username}: {e}")
        return None

def create_user(username, password, user_type):
    try:
        user_data = {
            'username': username,
            'password': generate_password_hash(password),
            'user_type': user_type,
            'created_at': datetime.now().isoformat()
        }
        
        users_table.put_item(
            Item=user_data,
            ConditionExpression='attribute_not_exists(username)'
        )
        return True
    except ClientError as e:
        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
            return False  # User already exists
        logger.error(f"Error creating user {username}: {e}")
        return False

def get_user_services(username, user_type):
    try:
        if user_type == 'homeowner':
            response = services_table.scan(
                FilterExpression='homeowner = :username',
                ExpressionAttributeValues={':username': username}
            )
        else:  # service_provider
            response = services_table.scan(
                FilterExpression='service_provider = :username OR (service_provider = :null_val AND #status = :pending)',
                ExpressionAttributeValues={
                    ':username': username,
                    ':null_val': None,
                    ':pending': 'pending'
                },
                ExpressionAttributeNames={'#status': 'status'}
            )
        
        services = []
        for item in response.get('Items', []):
            services.append(deserialize_item(item))
        
        return services
    except ClientError as e:
        logger.error(f"Error getting services for {username}: {e}")
        return []

def create_service_request(homeowner, service_type, priority, description, preferred_date=None):
    try:
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
        
        services_table.put_item(Item=service_request)
        
        # Send notification
        send_notification(
            f"New service request created by {homeowner}: {service_type} - {priority} priority",
            "New Service Request"
        )
        
        return service_id
    except ClientError as e:
        logger.error(f"Error creating service request: {e}")
        return None

def update_service_status(service_id, status, **kwargs):
    try:
        # Get current service
        response = services_table.get_item(Key={'service_id': service_id})
        if 'Item' not in response:
            return False
        
        # Prepare update expression
        update_expression = "SET #status = :status, updated_at = :updated_at"
        expression_values = {
            ':status': status,
            ':updated_at': datetime.now().isoformat()
        }
        expression_names = {'#status': 'status'}
        
        # Add additional fields
        for key, value in kwargs.items():
            if value is not None:
                placeholder = f":{key}"
                update_expression += f", {key} = {placeholder}"
                if isinstance(value, datetime):
                    expression_values[placeholder] = value.isoformat()
                elif isinstance(value, float):
                    # Convert float to Decimal for DynamoDB
                    expression_values[placeholder] = Decimal(str(value))
                else:
                    expression_values[placeholder] = value
        
        services_table.update_item(
            Key={'service_id': service_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expression_values,
            ExpressionAttributeNames=expression_names
        )
        
        # Send notification for status changes
        service = deserialize_item(response['Item'])
        homeowner = service.get('homeowner', 'Unknown')
        service_provider = service.get('service_provider', 'Unknown')
        
        if status == 'scheduled':
            send_notification(
                f"Service request accepted by {service_provider} for homeowner {homeowner}",
                "Service Request Accepted"
            )
        elif status == 'completed':
            send_notification(
                f"Service completed by {service_provider} for homeowner {homeowner}",
                "Service Completed"
            )
        
        return True
    except ClientError as e:
        logger.error(f"Error updating service {service_id}: {e}")
        return False

def get_service_by_id(service_id):
    try:
        response = services_table.get_item(Key={'service_id': service_id})
        return deserialize_item(response.get('Item'))
    except ClientError as e:
        logger.error(f"Error getting service {service_id}: {e}")
        return None

# Sample data initialization for testing
def initialize_sample_data():
    try:
        # Check if sample users already exist
        if not get_user_by_username('john_homeowner'):
            create_user('john_homeowner', 'password123', 'homeowner')
            logger.info("Created sample homeowner user")
        
        if not get_user_by_username('jane_provider'):
            create_user('jane_provider', 'password123', 'service_provider')
            logger.info("Created sample service provider user")
        
        # Create sample services if they don't exist
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
            try:
                services_table.put_item(
                    Item=service,
                    ConditionExpression='attribute_not_exists(service_id)'
                )
            except ClientError as e:
                if e.response['Error']['Code'] != 'ConditionalCheckFailedException':
                    logger.error(f"Error creating sample service: {e}")
        
        logger.info("Sample data initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing sample data: {e}")

# Authentication helper functions
def is_signed_in():
    return 'user_id' in session

def get_current_user():
    if is_signed_in():
        return get_user_by_username(session['user_id'])
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

# Main routes
@app.route('/')
def home():
    user = get_current_user()
    return render_template('home.html', user=user)

@app.route('/health')
def health_check():
    try:
        # Test DynamoDB connection
        users_table.describe_table()
        services_table.describe_table()
        return jsonify({'status': 'healthy', 'timestamp': datetime.now().isoformat()}), 200
    except Exception as e:
        return jsonify({'status': 'unhealthy', 'error': str(e)}), 500

@app.route('/signin', methods=['GET', 'POST'])
def signin():
    if is_signed_in():
        user = get_current_user()
        if user and user['user_type'] == 'homeowner':
            return redirect(url_for('homeowner_dashboard'))
        elif user:
            return redirect(url_for('service_provider_dashboard'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        
        if not username or not password:
            flash('Please enter both username and password.', 'error')
            return render_template('signin.html')
        
        user = get_user_by_username(username)
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
        elif user:
            return redirect(url_for('service_provider_dashboard'))
    
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        confirm_password = request.form.get('confirm_password', '')
        user_type = request.form.get('user_type', '')
        
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
        
        if create_user(username, password, user_type):
            flash('Account created successfully! Please sign in.', 'success')
            send_notification(f"New user registered: {username} ({user_type})", "New User Registration")
            return redirect(url_for('signin'))
        else:
            flash('Username already exists. Please choose a different one.', 'error')
            return render_template('signup.html')
    
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
        'total_earnings': sum(s.get('cost', 0) or 0 for s in provider_services if s['status'] == 'completed')
    }
    
    return render_template('service_provider_dashboard.html', 
                         user=user, 
                         services=provider_services,
                         stats=stats)

# API routes - Service management
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
    
    if service_id:
        return jsonify({
            'success': True,
            'service_id': service_id,
            'message': 'Service request created successfully'
        })
    else:
        return jsonify({'error': 'Failed to create service request'}), 500

@app.route('/api/update-service-status', methods=['POST'])
def api_update_service_status():
    if not is_signed_in():
        return jsonify({'error': 'Not signed in'}), 401
    
    data = request.get_json()
    service_id = data.get('service_id')
    new_status = data.get('status')
    
    if not service_id or not new_status:
        return jsonify({'error': 'service_id and status are required'}), 400
    
    service = get_service_by_id(service_id)
    if not service:
        return jsonify({'error': 'Service not found'}), 404
    
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 401
    
    # Authorization checks
    if new_status == 'scheduled' and service['status'] == 'pending':
        if user['user_type'] != 'service_provider':
            return jsonify({'error': 'Only service providers can accept requests'}), 403
    elif user['user_type'] == 'homeowner' and service['homeowner'] != user['username']:
        return jsonify({'error': 'Permission denied'}), 403
    elif user['user_type'] == 'service_provider' and service.get('service_provider') != user['username']:
        if not (service['status'] == 'pending' and service.get('service_provider') is None):
            return jsonify({'error': 'Permission denied'}), 403
    
    update_fields = {}
    if data.get('cost'):
        try:
            update_fields['cost'] = float(data['cost'])
        except ValueError:
            return jsonify({'error': 'Invalid cost value'}), 400
    
    if data.get('rating'):
        try:
            rating = int(data['rating'])
            if 1 <= rating <= 5:
                update_fields['rating'] = rating
            else:
                return jsonify({'error': 'Rating must be between 1 and 5'}), 400
        except ValueError:
            return jsonify({'error': 'Invalid rating value'}), 400
    
    if data.get('start_date'):
        try:
            update_fields['start_date'] = datetime.strptime(data['start_date'], '%Y-%m-%d %H:%M')
        except ValueError:
            return jsonify({'error': 'Invalid start_date format. Use YYYY-MM-DD HH:MM'}), 400
    
    # Set service provider for pending requests
    if new_status == 'scheduled' and service['status'] == 'pending':
        update_fields['service_provider'] = user['username']
    
    # Calculate duration for completed services
    if new_status == 'completed' and service.get('start_date'):
        try:
            start_date = datetime.fromisoformat(service['start_date']) if isinstance(service['start_date'], str) else service['start_date']
            duration = datetime.now() - start_date
            update_fields['duration'] = duration.total_seconds() / 3600
        except Exception as e:
            logger.error(f"Error calculating duration: {e}")
    
    success = update_service_status(service_id, new_status, **update_fields)
    
    if success:
        return jsonify({'success': True, 'message': 'Service updated successfully'})
    else:
        return jsonify({'error': 'Failed to update service'}), 500

@app.route('/api/assign-service-provider', methods=['POST'])
def api_assign_service_provider():
    if not is_signed_in():
        return jsonify({'error': 'Not signed in'}), 401
    
    user = get_current_user()
    if not user or user['user_type'] != 'service_provider':
        return jsonify({'error': 'Only service providers can accept requests'}), 403
    
    data = request.get_json()
    service_id = data.get('service_id')
    
    if not service_id:
        return jsonify({'error': 'service_id is required'}), 400
    
    service = get_service_by_id(service_id)
    if not service:
        return jsonify({'error': 'Service not found'}), 404
    
    if service['status'] != 'pending':
        return jsonify({'error': 'Service is not available for assignment'}), 400
    
    success = update_service_status(service_id, 'scheduled', service_provider=user['username'])
    
    if success:
        return jsonify({
            'success': True,
            'message': 'Service request accepted and scheduled'
        })
    else:
        return jsonify({'error': 'Failed to assign service provider'}), 500

@app.route('/api/complete-service', methods=['POST'])
def api_complete_service():
    if not is_signed_in():
        return jsonify({'error': 'Not signed in'}), 401
    
    user = get_current_user()
    if not user or user['user_type'] != 'service_provider':
        return jsonify({'error': 'Only service providers can complete services'}), 403
    
    data = request.get_json()
    service_id = data.get('service_id')
    cost = data.get('cost')
    notes = data.get('notes', '')
    
    if not service_id:
        return jsonify({'error': 'service_id is required'}), 400
    
    service = get_service_by_id(service_id)
    if not service:
        return jsonify({'error': 'Service not found'}), 404
    
    if service.get('service_provider') != user['username']:
        return jsonify({'error': 'Permission denied'}), 403
    
    if service['status'] != 'in_progress':
        return jsonify({'error': 'Service must be in progress to complete'}), 400
    
    update_fields = {}
    
    if cost:
        try:
            # Convert to float first, then it will be converted to Decimal in update_service_status
            update_fields['cost'] = float(cost)
        except ValueError:
            return jsonify({'error': 'Invalid cost value'}), 400
    
    if notes:
        update_fields['completion_notes'] = notes
    
    # Calculate duration
    if service.get('start_date'):
        try:
            start_date = datetime.fromisoformat(service['start_date']) if isinstance(service['start_date'], str) else service['start_date']
            duration = datetime.now() - start_date
            update_fields['duration'] = duration.total_seconds() / 3600
        except Exception as e:
            logger.error(f"Error calculating duration: {e}")
    
    success = update_service_status(service_id, 'completed', **update_fields)
    
    if success:
        return jsonify({
            'success': True,
            'message': 'Service completed successfully',
            'service': {
                'service_id': service_id,
                'cost': update_fields.get('cost'),
                'duration': update_fields.get('duration')
            }
        })
    else:
        return jsonify({'error': 'Failed to complete service'}), 500

# API routes - Data retrieval
@app.route('/api/get-services')
def api_get_services():
    if not is_signed_in():
        return jsonify({'error': 'Not signed in'}), 401
    
    user = get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 401
    
    services = get_user_services(user['username'], user['user_type'])
    
    services_json = []
    for service in services:
        service_copy = service.copy()
        for key, value in service_copy.items():
            service_copy[key] = serialize_datetime(value)
        services_json.append(service_copy)
    
    return jsonify({'services': services_json})

@app.route('/api/available-requests')
def api_available_requests():
    if not is_signed_in():
        return jsonify({'error': 'Not signed in'}), 401
    
    user = get_current_user()
    if not user or user['user_type'] != 'service_provider':
        return jsonify({'error': 'Only service providers can access this endpoint'}), 403
    
    try:
        response = services_table.scan(
            FilterExpression='#status = :pending AND service_provider = :null_val',
            ExpressionAttributeValues={
                ':pending': 'pending',
                ':null_val': None
            },
            ExpressionAttributeNames={'#status': 'status'}
        )
        
        available_requests = []
        for item in response.get('Items', []):
            service_copy = deserialize_item(item)
            for key, value in service_copy.items():
                service_copy[key] = serialize_datetime(value)
            available_requests.append(service_copy)
        
        return jsonify({'requests': available_requests})
    except ClientError as e:
        logger.error(f"Error getting available requests: {e}")
        return jsonify({'error': 'Failed to get available requests'}), 500

@app.route('/api/current-user')
def api_current_user():
    if not is_signed_in():
        return jsonify({'error': 'Not signed in'}), 401
    
    user = get_current_user()
    if user:
        return jsonify({
            'username': user['username'],
            'user_type': user['user_type'],
            'created_at': serialize_datetime(user.get('created_at'))
        })
    else:
        return jsonify({'error': 'User not found'}), 404

@app.route('/api/check-username', methods=['POST'])
def check_username():
    username = request.json.get('username', '').strip()
    user = get_user_by_username(username)
    exists = user is not None
    return jsonify({'exists': exists})

# Template filters
@app.template_filter('datetime')
def datetime_filter(value):
    if isinstance(value, datetime):
        return value.strftime('%Y-%m-%d %H:%M:%S')
    elif isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value)
            return dt.strftime('%Y-%m-%d %H:%M:%S')
        except ValueError:
            return value
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
