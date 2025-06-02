// Homeowner Dashboard JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize dashboard
    initializeDashboard();
    
    // Service request form handler
    const serviceRequestForm = document.getElementById('serviceRequestForm');
    if (serviceRequestForm) {
        serviceRequestForm.addEventListener('submit', handleServiceRequest);
    }
    
    // Load user services
    loadUserServices();
    
    // Set minimum date for preferred date picker
    const preferredDateInput = document.getElementById('preferredDate');
    if (preferredDateInput) {
        const today = new Date().toISOString().split('T')[0];
        preferredDateInput.min = today;
    }
});

function initializeDashboard() {
    console.log('Homeowner Dashboard Initialized');
    
    // Add event listeners for action buttons
    addActionButtonListeners();
    
    // Load real-time stats
    loadDashboardStats();
}

function handleServiceRequest(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    const serviceData = {
        service_type: formData.get('serviceType'),
        priority: formData.get('priority'),
        description: formData.get('description'),
        preferred_date: formData.get('preferredDate') || null,
        preferred_time: formData.get('preferredTime') || null
    };
    
    // Validate form data
    if (!serviceData.service_type || !serviceData.priority || !serviceData.description) {
        showAlert('Please fill in all required fields.', 'error');
        return;
    }
    
    // Combine date and time if both are provided
    if (serviceData.preferred_date && serviceData.preferred_time) {
        serviceData.preferred_date = serviceData.preferred_date + ' ' + serviceData.preferred_time;
    }
    
    // Show loading state
    const submitButton = event.target.querySelector('button[type="submit"]');
    const originalText = submitButton.innerHTML;
    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Submitting...';
    submitButton.disabled = true;
    
    // Submit service request
    fetch('/api/create-service-request', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(serviceData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('Service request submitted successfully!', 'success');
            event.target.reset();
            loadUserServices(); // Refresh the services list
            loadDashboardStats(); // Update stats
        } else {
            showAlert(data.error || 'Failed to submit service request', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showAlert('An error occurred while submitting your request', 'error');
    })
    .finally(() => {
        // Reset button state
        submitButton.innerHTML = originalText;
        submitButton.disabled = false;
    });
}

function loadUserServices() {
    fetch('/api/get-services')
    .then(response => response.json())
    .then(data => {
        if (data.services) {
            updateActiveRequests(data.services);
            updateMaintenanceRecords(data.services);
        }
    })
    .catch(error => {
        console.error('Error loading services:', error);
        showAlert('Failed to load services', 'error');
    });
}

function updateActiveRequests(services) {
    const activeServices = services.filter(service => 
        service.status === 'in_progress' || service.status === 'scheduled' || service.status === 'pending'
    );
    
    // Target the specific Active Requests container by ID
    const activeRequestsContainer = document.getElementById('activeRequestsContainer');
    if (!activeRequestsContainer) return;
    
    // Clear existing content except preserve the "View All" button
    const existingServiceCards = activeRequestsContainer.querySelectorAll('.service-card');
    existingServiceCards.forEach(card => card.remove());
    
    // Remove loading message
    const loadingMessage = activeRequestsContainer.querySelector('.text-center.text-muted');
    if (loadingMessage) loadingMessage.remove();
    
    if (activeServices.length === 0) {
        // Create the no services message (but preserve the view all button)
        const noServicesDiv = document.createElement('div');
        noServicesDiv.className = 'text-center text-muted py-4';
        noServicesDiv.innerHTML = '<i class="fas fa-clipboard-list fa-2x mb-2"></i><p>No active service requests</p>';
        
        // Insert at the beginning of the scrollable content area
        const scrollableContent = activeRequestsContainer.querySelector('.scrollable-content') || activeRequestsContainer;
        scrollableContent.insertBefore(noServicesDiv, scrollableContent.firstChild);
        return;
    }
    
    // Add each active service card to the scrollable content area
    const scrollableContent = activeRequestsContainer.querySelector('.scrollable-content') || activeRequestsContainer;
    activeServices.forEach(service => {
        const serviceCard = createServiceCard(service);
        scrollableContent.insertBefore(serviceCard, scrollableContent.firstChild);
    });
}

function createServiceCard(service) {
    const card = document.createElement('div');
    card.className = 'service-card';
    
    const statusClass = getStatusClass(service.status);
    const statusText = getStatusText(service.status);
    
    card.innerHTML = `
        <div class="d-flex justify-content-between align-items-start mb-2">
            <h6 class="mb-1">${service.service}</h6>
            <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <p class="text-muted small mb-2">${service.service_type.charAt(0).toUpperCase() + service.service_type.slice(1)} • ${service.priority.charAt(0).toUpperCase() + service.priority.slice(1)} Priority</p>
        ${service.service_provider ? `<p class="text-muted small">Service Provider: ${service.service_provider}</p>` : '<p class="text-muted small">Service Provider: Not assigned</p>'}
        <div class="d-flex justify-content-between align-items-center">
            <small class="text-muted">${getServiceTimeText(service)}</small>
            <div>
                <button class="btn btn-outline-primary btn-sm me-1" onclick="viewServiceDetails('${service.service_id}')">
                    <i class="fas fa-eye me-1"></i>View Details
                </button>
                ${service.status === 'scheduled' ? `<button class="btn btn-outline-warning btn-sm" onclick="rescheduleService('${service.service_id}')">
                    <i class="fas fa-calendar me-1"></i>Reschedule
                </button>` : ''}
            </div>
        </div>
    `;
    
    return card;
}

function updateMaintenanceRecords(services) {
    const completedServices = services.filter(service => service.status === 'completed');
    const tableBody = document.querySelector('.table tbody');
    
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    if (completedServices.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="6" class="text-center text-muted py-4">No completed services yet</td>';
        tableBody.appendChild(row);
        return;
    }
    
    completedServices.forEach(service => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <strong>${service.service}</strong>
                <br><small class="text-muted">${service.service_type.charAt(0).toUpperCase() + service.service_type.slice(1)}</small>
            </td>
            <td>${service.service_provider || 'N/A'}</td>
            <td>${formatDate(service.updated_at)}</td>
            <td>${service.cost ? '$' + service.cost.toFixed(2) : 'N/A'}</td>
            <td><span class="status-badge status-completed">Completed</span></td>
            <td>
                <button class="btn btn-outline-primary btn-sm me-1" onclick="viewServiceDetails('${service.service_id}')">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-outline-primary btn-sm" onclick="rateService('${service.service_id}')">
                    <i class="fas fa-star"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function loadDashboardStats() {
    fetch('/api/get-services')
    .then(response => response.json())
    .then(data => {
        if (data.services) {
            updateStatsCards(data.services);
        }
    })
    .catch(error => {
        console.error('Error loading stats:', error);
    });
}

function updateStatsCards(services) {
    const stats = {
        total: services.length,
        inProgress: services.filter(s => s.status === 'in_progress').length,
        completed: services.filter(s => s.status === 'completed').length,
        scheduled: services.filter(s => s.status === 'scheduled').length
    };
    
    const statCards = document.querySelectorAll('.stat-card .stat-number');
    if (statCards.length >= 4) {
        statCards[0].textContent = stats.total;
        statCards[1].textContent = stats.inProgress;
        statCards[2].textContent = stats.completed;
        statCards[3].textContent = stats.scheduled;
    }
}

function addActionButtonListeners() {
    // Add event listeners for existing buttons
    const exportButton = document.querySelector('button[data-action="export"]');
    if (exportButton) {
        exportButton.addEventListener('click', exportRecords);
    }
    
    const viewAllButton = document.querySelector('button[data-action="view-all"]');
    if (viewAllButton) {
        viewAllButton.addEventListener('click', viewAllRequests);
    }
    
    // Add hover effects for service cards (preserve your existing functionality)
    document.addEventListener('mouseenter', function(e) {
        if (e.target.closest('.service-card')) {
            e.target.closest('.service-card').style.transform = 'translateY(-2px)';
        }
    }, true);
    
    document.addEventListener('mouseleave', function(e) {
        if (e.target.closest('.service-card')) {
            e.target.closest('.service-card').style.transform = 'translateY(0)';
        }
    }, true);
}

// Action functions
function viewServiceDetails(serviceId) {
    // Create a modal to show service details
    fetch('/api/get-services')
    .then(response => response.json())
    .then(data => {
        const service = data.services.find(s => s.service_id === serviceId);
        if (service) {
            showServiceDetailsModal(service);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showAlert('Failed to load service details', 'error');
    });
}

function showServiceDetailsModal(service) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Service Details</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="row">
                        <div class="col-md-6">
                            <h6>Service Information</h6>
                            <p><strong>Service:</strong> ${service.service}</p>
                            <p><strong>Type:</strong> ${service.service_type.charAt(0).toUpperCase() + service.service_type.slice(1)}</p>
                            <p><strong>Priority:</strong> ${service.priority.charAt(0).toUpperCase() + service.priority.slice(1)}</p>
                            <p><strong>Status:</strong> <span class="status-badge ${getStatusClass(service.status)}">${getStatusText(service.status)}</span></p>
                            <p><strong>Description:</strong> ${service.description}</p>
                        </div>
                        <div class="col-md-6">
                            <h6>Timeline & Details</h6>
                            <p><strong>Created:</strong> ${formatDateTime(service.created_at)}</p>
                            <p><strong>Preferred Date:</strong> ${service.preferred_date ? formatDateTime(service.preferred_date) : 'Not specified'}</p>
                            <p><strong>Start Date:</strong> ${service.start_date ? formatDateTime(service.start_date) : 'Not started'}</p>
                            <p><strong>Service Provider:</strong> ${service.service_provider || 'Not assigned'}</p>
                            <p><strong>Cost:</strong> ${service.cost ? '$' + service.cost.toFixed(2) : 'Not specified'}</p>
                            ${service.rating ? `<p><strong>Rating:</strong> ${'★'.repeat(service.rating)}${'☆'.repeat(5-service.rating)}</p>` : ''}
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
    
    modal.addEventListener('hidden.bs.modal', function() {
        document.body.removeChild(modal);
    });
}

function rescheduleService(serviceId) {
    // Create a modal for rescheduling
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Reschedule Service</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <form id="rescheduleForm">
                        <div class="mb-3">
                            <label for="newDate" class="form-label">New Preferred Date</label>
                            <input type="date" class="form-control" id="newDate" required>
                        </div>
                        <div class="mb-3">
                            <label for="newTime" class="form-label">New Preferred Time</label>
                            <input type="time" class="form-control" id="newTime">
                        </div>
                        <div class="mb-3">
                            <label for="rescheduleReason" class="form-label">Reason for Rescheduling</label>
                            <textarea class="form-control" id="rescheduleReason" rows="3" placeholder="Optional reason..."></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" onclick="confirmReschedule('${serviceId}')">Reschedule</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
    
    // Set minimum date to today
    const newDateInput = modal.querySelector('#newDate');
    const today = new Date().toISOString().split('T')[0];
    newDateInput.min = today;
    
    modal.addEventListener('hidden.bs.modal', function() {
        document.body.removeChild(modal);
    });
}

function confirmReschedule(serviceId) {
    const newDate = document.getElementById('newDate').value;
    const newTime = document.getElementById('newTime').value;
    
    if (!newDate) {
        showAlert('Please select a new date', 'error');
        return;
    }
    
    let preferredDate = newDate;
    if (newTime) {
        preferredDate += ' ' + newTime;
    }
    
    // Update the service with new preferred date
    fetch('/api/update-service-status', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            service_id: serviceId,
            status: 'scheduled',
            preferred_date: preferredDate
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('Service rescheduled successfully!', 'success');
            loadUserServices();
            bootstrap.Modal.getInstance(document.querySelector('.modal')).hide();
        } else {
            showAlert(data.error || 'Failed to reschedule service', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showAlert('An error occurred while rescheduling', 'error');
    });
}

function rateService(serviceId) {
    // Create a modal for rating
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Rate Service</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="text-center mb-3">
                        <p>How would you rate this service?</p>
                        <div class="star-rating" data-rating="0">
                            <span class="star" data-value="1">☆</span>
                            <span class="star" data-value="2">☆</span>
                            <span class="star" data-value="3">☆</span>
                            <span class="star" data-value="4">☆</span>
                            <span class="star" data-value="5">☆</span>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label for="ratingComment" class="form-label">Additional Comments (Optional)</label>
                        <textarea class="form-control" id="ratingComment" rows="3" placeholder="Share your experience..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" onclick="submitRating('${serviceId}')">Submit Rating</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
    
    // Add star rating functionality
    const stars = modal.querySelectorAll('.star');
    const starRating = modal.querySelector('.star-rating');
    
    stars.forEach(star => {
        star.addEventListener('click', function() {
            const rating = parseInt(this.dataset.value);
            starRating.dataset.rating = rating;
            
            stars.forEach((s, index) => {
                if (index < rating) {
                    s.textContent = '★';
                    s.style.color = '#ffc107';
                } else {
                    s.textContent = '☆';
                    s.style.color = '#dee2e6';
                }
            });
        });
        
        star.addEventListener('mouseover', function() {
            const rating = parseInt(this.dataset.value);
            stars.forEach((s, index) => {
                if (index < rating) {
                    s.style.color = '#ffc107';
                } else {
                    s.style.color = '#dee2e6';
                }
            });
        });
    });
    
    modal.addEventListener('hidden.bs.modal', function() {
        document.body.removeChild(modal);
    });
}

function submitRating(serviceId) {
    const rating = parseInt(document.querySelector('.star-rating').dataset.rating);
    
    if (rating === 0) {
        showAlert('Please select a rating', 'error');
        return;
    }
    
    fetch('/api/update-service-status', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            service_id: serviceId,
            status: 'completed',
            rating: rating
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('Thank you for your rating!', 'success');
            loadUserServices();
            bootstrap.Modal.getInstance(document.querySelector('.modal')).hide();
        } else {
            showAlert(data.error || 'Failed to submit rating', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showAlert('An error occurred while submitting rating', 'error');
    });
}

function exportRecords() {
    fetch('/api/get-services')
    .then(response => response.json())
    .then(data => {
        if (data.services) {
            const completedServices = data.services.filter(s => s.status === 'completed');
            if (completedServices.length === 0) {
                showAlert('No completed services to export', 'info');
                return;
            }
            
            // Create CSV content
            const headers = ['Service', 'Type', 'Provider', 'Date', 'Cost', 'Rating'];
            const csvContent = [headers.join(',')];
            
            completedServices.forEach(service => {
                const row = [
                    `"${service.service}"`,
                    service.service_type,
                    service.service_provider || 'N/A',
                    formatDate(service.updated_at),
                    service.cost || 'N/A',
                    service.rating || 'N/A'
                ];
                csvContent.push(row.join(','));
            });
            
            // Download CSV
            const blob = new Blob([csvContent.join('\n')], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'maintenance_records.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            
            showAlert('Records exported successfully!', 'success');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showAlert('Failed to export records', 'error');
    });
}

function viewAllRequests() {
    fetch('/api/get-services')
    .then(response => response.json())
    .then(data => {
        if (data.services) {
            showAllRequestsModal(data.services);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showAlert('Failed to load all requests', 'error');
    });
}

function showAllRequestsModal(services) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog modal-xl">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">All Service Requests</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                        <table class="table table-hover">
                            <thead class="table-light sticky-top">
                                <tr>
                                    <th>Service</th>
                                    <th>Type</th>
                                    <th>Priority</th>
                                    <th>Status</th>
                                    <th>Provider</th>
                                    <th>Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${services.map(service => `
                                    <tr>
                                        <td><strong>${service.service}</strong></td>
                                        <td>${service.service_type.charAt(0).toUpperCase() + service.service_type.slice(1)}</td>
                                        <td><span class="badge bg-${service.priority === 'high' ? 'danger' : service.priority === 'medium' ? 'warning' : 'info'}">${service.priority.charAt(0).toUpperCase() + service.priority.slice(1)}</span></td>
                                        <td><span class="status-badge ${getStatusClass(service.status)}">${getStatusText(service.status)}</span></td>
                                        <td>${service.service_provider || 'Not assigned'}</td>
                                        <td>${formatDate(service.created_at)}</td>
                                        <td>
                                            <button class="btn btn-outline-primary btn-sm" onclick="viewServiceDetails('${service.service_id}')">
                                                <i class="fas fa-eye"></i>
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    const bootstrapModal = new bootstrap.Modal(modal);
    bootstrapModal.show();
    
    modal.addEventListener('hidden.bs.modal', function() {
        document.body.removeChild(modal);
    });
}

// Helper functions
function getStatusClass(status) {
    const statusClasses = {
        'pending': 'status-pending',
        'in_progress': 'status-progress',
        'completed': 'status-completed',
        'scheduled': 'status-scheduled',
        'cancelled': 'status-cancelled'
    };
    return statusClasses[status] || 'status-pending';
}

function getStatusText(status) {
    const statusTexts = {
        'pending': 'Pending',
        'in_progress': 'In Progress',
        'completed': 'Completed',
        'scheduled': 'Scheduled',
        'cancelled': 'Cancelled'
    };
    return statusTexts[status] || 'Unknown';
}

function getServiceTimeText(service) {
    if (service.start_date) {
        return `Started: ${formatDateTime(service.start_date)}`;
    } else if (service.preferred_date) {
        return `Preferred: ${formatDateTime(service.preferred_date)}`;
    } else {
        return `Created: ${formatDateTime(service.created_at)}`;
    }
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showAlert(message, type = 'info') {
    // Create alert element
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
    alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}

// Service status update function for service providers (if needed)
function updateServiceStatus(serviceId, status, additionalData = {}) {
    const updateData = {
        service_id: serviceId,
        status: status,
        ...additionalData
    };
    
    fetch('/api/update-service-status', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('Service status updated successfully!', 'success');
            loadUserServices(); // Refresh the services list
            loadDashboardStats(); // Update stats
        } else {
            showAlert(data.error || 'Failed to update service status', 'error');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showAlert('An error occurred while updating service status', 'error');
    });
}

// Real-time updates function (enhanced version of your interval check)
function checkForUpdates() {
    console.log('Checking for request updates...');
    loadUserServices();
    loadDashboardStats();
}

// Check for updates every 30 seconds
setInterval(checkForUpdates, 30000);