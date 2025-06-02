// Service Provider Dashboard JavaScript
// This file handles all interactive functionality for the service provider dashboard

class ServiceProviderDashboard {
    constructor() {
        this.currentUser = null;
        this.services = [];
        this.stats = {};
        this.init();
    }

    // Initialize the dashboard
    async init() {
        try {
            await this.loadCurrentUser();
            await this.loadServices();
            await this.loadStats();
            this.setupEventListeners();
            this.startAutoRefresh();
            console.log('Service Provider Dashboard initialized successfully');
        } catch (error) {
            console.error('Failed to initialize dashboard:', error);
            this.showNotification('Failed to load dashboard data', 'error');
        }
    }

    // Load current user information
    async loadCurrentUser() {
        try {
            const response = await fetch('/api/current-user');
            if (response.ok) {
                this.currentUser = await response.json();
            } else {
                throw new Error('Failed to load user data');
            }
        } catch (error) {
            console.error('Error loading current user:', error);
            throw error;
        }
    }

    // Load services data
    async loadServices() {
        try {
            const response = await fetch('/api/get-services');
            if (response.ok) {
                const data = await response.json();
                this.services = data.services || [];
                this.renderServices();
            } else {
                throw new Error('Failed to load services');
            }
        } catch (error) {
            console.error('Error loading services:', error);
            this.showNotification('Failed to load services', 'error');
        }
    }

    // Load available service requests
    async loadAvailableRequests() {
        try {
            const response = await fetch('/api/available-requests');
            if (response.ok) {
                const data = await response.json();
                return data.requests || [];
            } else {
                throw new Error('Failed to load available requests');
            }
        } catch (error) {
            console.error('Error loading available requests:', error);
            return [];
        }
    }

    // Load dashboard statistics
    async loadStats() {
        try {
            // Calculate stats from services data
            const pending = this.services.filter(s => s.status === 'pending').length;
            const inProgress = this.services.filter(s => s.status === 'in_progress').length;
            const completed = this.services.filter(s => s.status === 'completed').length;
            const totalEarnings = this.services
                .filter(s => s.status === 'completed' && s.cost)
                .reduce((sum, s) => sum + (parseFloat(s.cost) || 0), 0);

            this.stats = {
                pending,
                in_progress: inProgress,
                completed,
                total_earnings: totalEarnings
            };

            this.updateStatsDisplay();
        } catch (error) {
            console.error('Error calculating stats:', error);
        }
    }

    // Update statistics display
    updateStatsDisplay() {
        const elements = {
            pending: document.querySelector('[data-stat="pending"]') || document.getElementById('pendingStat'),
            inProgress: document.querySelector('[data-stat="in_progress"]') || document.getElementById('inProgessStat'),
            completed: document.querySelector('[data-stat="completed"]') || document.getElementById('completedStat'),
            earnings: document.querySelector('[data-stat="earnings"]') || document.getElementById('earningsStat')
        };

        if (elements.pending) elements.pending.textContent = this.stats.pending;
        if (elements.inProgress) elements.inProgress.textContent = this.stats.in_progress;
        if (elements.completed) elements.completed.textContent = this.stats.completed;
        if (elements.earnings) elements.earnings.textContent = `$${this.stats.total_earnings.toFixed(2)}`;
    }

    // Render services in the dashboard
    renderServices() {
        this.renderPendingJobs();
        this.renderActiveJobs();
        this.renderCompletedJobs();
    }

    // Render pending job requests
    async renderPendingJobs() {
        const container = document.getElementById('pendingJobs');
        if (!container) return;

        const availableRequests = await this.loadAvailableRequests();
        
        if (availableRequests.length === 0) {
            container.innerHTML = `
                <div class="card job-card">
                    <div class="card-body text-center py-4">
                        <i class="fas fa-inbox fa-3x text-muted mb-3"></i>
                        <h5 class="text-muted">No pending requests</h5>
                        <p class="text-muted">Check back later for new service requests</p>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = availableRequests.map(service => this.createPendingJobCard(service)).join('');
    }

    // Render active jobs
    renderActiveJobs() {
        const container = document.getElementById('activeJobs');
        if (!container) return;

        const activeServices = this.services.filter(s => 
            s.status === 'scheduled' || s.status === 'in_progress'
        );

        if (activeServices.length === 0) {
            container.innerHTML = `
                <div class="card job-card">
                    <div class="card-body text-center py-4">
                        <i class="fas fa-clipboard-list fa-3x text-muted mb-3"></i>
                        <h5 class="text-muted">No active jobs</h5>
                        <p class="text-muted">Accept pending requests to get started</p>
                    </div>
                </div>
            `;
            return;
        }

        container.innerHTML = activeServices.map(service => this.createActiveJobCard(service)).join('');
    }

    // Render completed jobs table
    renderCompletedJobs() {
        const tbody = document.querySelector('.table tbody');
        if (!tbody) return;

        const completedServices = this.services
            .filter(s => s.status === 'completed')
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
            .slice(0, 10); // Show last 10 completed jobs

        if (completedServices.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4">
                        <i class="fas fa-history fa-2x text-muted mb-2"></i>
                        <p class="text-muted mb-0">No completed jobs yet</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = completedServices.map(service => this.createCompletedJobRow(service)).join('');
    }

    // Create pending job card HTML
    createPendingJobCard(service) {
        const priorityClass = this.getPriorityClass(service.priority);
        const priorityColor = this.getPriorityColor(service.priority);
        const preferredDate = service.preferred_date ? 
            new Date(service.preferred_date).toLocaleDateString() : 'Flexible';

        return `
            <div class="card job-card priority-${service.priority}" data-job-id="${service.service_id}">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h6 class="card-title mb-0">${service.service || 'Service Request'}</h6>
                        <span class="status-badge status-pending">Pending</span>
                    </div>
                    
                    <p class="card-text text-muted small mb-2">
                        <i class="fas fa-user me-1"></i>${service.homeowner}
                    </p>
                    
                    <p class="card-text">${service.description}</p>
                    
                    <div class="row text-center mb-3">
                        <div class="col-4">
                            <small class="text-muted">Priority</small>
                            <div class="fw-bold text-capitalize ${priorityColor}">${service.priority}</div>
                        </div>
                        <div class="col-4">
                            <small class="text-muted">Type</small>
                            <div class="fw-bold text-capitalize">${service.service_type}</div>
                        </div>
                        <div class="col-4">
                            <small class="text-muted">Preferred</small>
                            <div class="fw-bold">${preferredDate}</div>
                        </div>
                    </div>
                    
                    <div class="d-grid gap-2 d-md-flex justify-content-md-end">
                        <button class="btn btn-outline-secondary btn-sm" onclick="dashboard.declineJob('${service.service_id}')">
                            <i class="fas fa-times me-1"></i>Skip
                        </button>
                        <button class="btn btn-primary btn-sm" onclick="dashboard.acceptJob('${service.service_id}')">
                            <i class="fas fa-check me-1"></i>Accept
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Create active job card HTML
    createActiveJobCard(service) {
        const statusBadge = this.getStatusBadge(service.status);
        const actionButton = this.getActionButton(service);
        const startDate = service.start_date ? 
            new Date(service.start_date).toLocaleString() : 'Not started';

        return `
            <div class="card job-card" data-job-id="${service.service_id}">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h6 class="card-title mb-0">${service.service || 'Service'}</h6>
                        ${statusBadge}
                    </div>
                    
                    <p class="card-text text-muted small mb-2">
                        <i class="fas fa-user me-1"></i>${service.homeowner}
                    </p>
                    
                    <p class="card-text">${service.description}</p>
                    
                    <div class="row text-center mb-3">
                        <div class="col-6">
                            <small class="text-muted">Cost</small>
                            <div class="fw-bold">${service.cost ? '$' + service.cost : 'TBD'}</div>
                        </div>
                        <div class="col-6">
                            <small class="text-muted">${service.status === 'scheduled' ? 'Scheduled' : 'Started'}</small>
                            <div class="fw-bold">${startDate}</div>
                        </div>
                    </div>
                    
                    <div class="d-grid">
                        ${actionButton}
                    </div>
                </div>
            </div>
        `;
    }

    // Create completed job row HTML
    createCompletedJobRow(service) {
        const completedDate = new Date(service.updated_at).toLocaleDateString();
        const duration = service.duration ? `${service.duration.toFixed(1)}h` : '-';
        const cost = service.cost ? `$${service.cost}` : '-';
        const rating = this.createRatingStars(service.rating);

        return `
            <tr>
                <td>
                    <strong>${service.service || 'Service'}</strong>
                    <br><small class="text-muted">${service.service_type}</small>
                </td>
                <td>${service.homeowner}</td>
                <td>${completedDate}</td>
                <td>${duration}</td>
                <td>${cost}</td>
                <td>${rating}</td>
            </tr>
        `;
    }

    // Get priority CSS class
    getPriorityClass(priority) {
        const classes = {
            'high': 'priority-high',
            'medium': 'priority-medium',
            'low': 'priority-low'
        };
        return classes[priority] || '';
    }

    // Get priority color class
    getPriorityColor(priority) {
        const colors = {
            'high': 'text-danger',
            'medium': 'text-warning',
            'low': 'text-success'
        };
        return colors[priority] || 'text-secondary';
    }

    // Get status badge HTML
    getStatusBadge(status) {
        const badges = {
            'pending': '<span class="status-badge status-pending">Pending</span>',
            'scheduled': '<span class="status-badge status-scheduled">Scheduled</span>',
            'in_progress': '<span class="status-badge status-in_progress">In Progress</span>',
            'completed': '<span class="status-badge status-completed">Completed</span>'
        };
        return badges[status] || `<span class="status-badge">${status}</span>`;
    }

    // Get action button HTML based on service status
    getActionButton(service) {
        switch (service.status) {
            case 'scheduled':
                return `
                    <button class="btn btn-success btn-sm" onclick="dashboard.startJob('${service.service_id}')">
                        <i class="fas fa-play me-1"></i>Start Job
                    </button>
                `;
            case 'in_progress':
                return `
                    <button class="btn btn-primary btn-sm" onclick="dashboard.completeJob('${service.service_id}')">
                        <i class="fas fa-check me-1"></i>Mark Complete
                    </button>
                `;
            default:
                return '';
        }
    }

    // Create rating stars HTML
    createRatingStars(rating) {
        if (!rating) return '<span class="text-muted">Not rated</span>';
        
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            if (i <= rating) {
                stars += '<i class="fas fa-star text-warning"></i>';
            } else {
                stars += '<i class="far fa-star text-warning"></i>';
            }
        }
        return stars;
    }

    // Accept a job request
    async acceptJob(serviceId) {
        try {
            this.showLoading(true);
            
            const response = await fetch('/api/assign-service-provider', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    service_id: serviceId
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                this.showNotification('Job accepted successfully!', 'success');
                await this.refreshData();
            } else {
                throw new Error(result.error || 'Failed to accept job');
            }
        } catch (error) {
            console.error('Error accepting job:', error);
            this.showNotification(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Decline/skip a job request
    declineJob(serviceId) {
        // For now, just hide the job card since we're skipping it
        const jobCard = document.querySelector(`[data-job-id="${serviceId}"]`);
        if (jobCard) {
            jobCard.style.transition = 'opacity 0.3s ease';
            jobCard.style.opacity = '0.5';
            jobCard.style.pointerEvents = 'none';
            
            // Add a "skipped" indicator
            const statusBadge = jobCard.querySelector('.status-badge');
            if (statusBadge) {
                statusBadge.textContent = 'Skipped';
                statusBadge.className = 'status-badge bg-secondary';
            }
        }
        
        this.showNotification('Job skipped', 'info');
    }

    // Start a scheduled job
    async startJob(serviceId) {
        try {
            this.showLoading(true);
            
            const response = await fetch('/api/update-service-status', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    service_id: serviceId,
                    status: 'in_progress',
                    start_date: new Date().toISOString().slice(0, 16).replace('T', ' ')
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                this.showNotification('Job started!', 'success');
                await this.refreshData();
            } else {
                throw new Error(result.error || 'Failed to start job');
            }
        } catch (error) {
            console.error('Error starting job:', error);
            this.showNotification(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Complete a job
    async completeJob(serviceId) {
        const cost = prompt('Enter the service cost ($):');
        if (cost === null) return; // User cancelled

        const costValue = parseFloat(cost);
        if (isNaN(costValue) || costValue <= 0) {
            this.showNotification('Please enter a valid cost amount', 'error');
            return;
        }

        try {
            this.showLoading(true);
            
            const response = await fetch('/api/complete-service', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    service_id: serviceId,
                    cost: costValue,
                    notes: '' // Could add notes input in the future
                })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                this.showNotification('Job completed successfully!', 'success');
                await this.refreshData();
            } else {
                throw new Error(result.error || 'Failed to complete job');
            }
        } catch (error) {
            console.error('Error completing job:', error);
            this.showNotification(error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    // Refresh all dashboard data
    async refreshData() {
        try {
            await this.loadServices();
            await this.loadStats();
        } catch (error) {
            console.error('Error refreshing data:', error);
        }
    }

    // Setup event listeners
    setupEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshData());
        }

        // Auto-refresh toggle
        const autoRefreshToggle = document.getElementById('autoRefreshToggle');
        if (autoRefreshToggle) {
            autoRefreshToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.startAutoRefresh();
                } else {
                    this.stopAutoRefresh();
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'r':
                        e.preventDefault();
                        this.refreshData();
                        break;
                }
            }
        });
    }

    // Start auto-refresh
    startAutoRefresh() {
        this.stopAutoRefresh(); // Clear existing interval
        this.autoRefreshInterval = setInterval(() => {
            this.refreshData();
        }, 30000); // Refresh every 30 seconds
    }

    // Stop auto-refresh
    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
        }
    }

    // Show loading state
    showLoading(show) {
        const loader = document.getElementById('loadingSpinner');
        if (loader) {
            loader.style.display = show ? 'block' : 'none';
        }
        
        // Disable buttons during loading
        const buttons = document.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.disabled = show;
        });
    }

    // Show notification
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `alert alert-${this.getBootstrapAlertClass(type)} alert-dismissible fade show notification-toast`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 300px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        `;
        
        notification.innerHTML = `
            ${this.getNotificationIcon(type)} ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }

    // Get Bootstrap alert class for notification type
    getBootstrapAlertClass(type) {
        const classes = {
            'success': 'success',
            'error': 'danger',
            'warning': 'warning',
            'info': 'info'
        };
        return classes[type] || 'info';
    }

    // Get notification icon
    getNotificationIcon(type) {
        const icons = {
            'success': '<i class="fas fa-check-circle me-2"></i>',
            'error': '<i class="fas fa-exclamation-circle me-2"></i>',
            'warning': '<i class="fas fa-exclamation-triangle me-2"></i>',
            'info': '<i class="fas fa-info-circle me-2"></i>'
        };
        return icons[type] || '';
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new ServiceProviderDashboard();
});

// Legacy global functions for backward compatibility
function acceptJob(serviceId) {
    if (window.dashboard) {
        window.dashboard.acceptJob(serviceId);
    }
}

function declineJob(serviceId) {
    if (window.dashboard) {
        window.dashboard.declineJob(serviceId);
    }
}

function updateJobStatus(currentStatus, newStatus, serviceId) {
    if (window.dashboard) {
        if (newStatus === 'in_progress') {
            window.dashboard.startJob(serviceId);
        } else if (newStatus === 'completed') {
            window.dashboard.completeJob(serviceId);
        }
    }
}

// Utility functions
function formatCurrency(amount) {
    if (amount == null) return '-';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString();
}

function formatDateTime(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString();
}

function formatDuration(hours) {
    if (hours == null) return '-';
    if (hours < 1) {
        return `${Math.round(hours * 60)}min`;
    }
    return `${hours.toFixed(1)}h`;
}