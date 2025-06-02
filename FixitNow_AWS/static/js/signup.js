// Handle user type selection
        document.querySelectorAll('.user-type-card').forEach(card => {
            card.addEventListener('click', function() {
                const userTypeInput = document.getElementById('userType');
                
                // Remove selected class from all cards
                document.querySelectorAll('.user-type-card').forEach(c => c.classList.remove('selected'));
                
                // Add selected class to clicked card
                this.classList.add('selected');
                
                // Set the hidden input value
                userTypeInput.value = this.dataset.type;
            });
        });

        // Password strength checker
        document.getElementById('password').addEventListener('input', function() {
            const password = this.value;
            const strengthDiv = document.getElementById('passwordStrength');
            
            if (password.length === 0) {
                strengthDiv.textContent = '';
                return;
            }
            
            let strength = 0;
            let feedback = [];
            
            if (password.length >= 8) strength++;
            else feedback.push('at least 8 characters');
            
            if (/[a-z]/.test(password)) strength++;
            else feedback.push('lowercase letter');
            
            if (/[A-Z]/.test(password)) strength++;
            else feedback.push('uppercase letter');
            
            if (/\d/.test(password)) strength++;
            else feedback.push('number');
            
            if (/[^A-Za-z0-9]/.test(password)) strength++;
            else feedback.push('special character');
            
            if (strength < 2) {
                strengthDiv.className = 'password-strength strength-weak';
                strengthDiv.textContent = 'Weak password. Add: ' + feedback.join(', ');
            } else if (strength < 4) {
                strengthDiv.className = 'password-strength strength-medium';
                strengthDiv.textContent = 'Medium strength. Add: ' + feedback.join(', ');
            } else {
                strengthDiv.className = 'password-strength strength-strong';
                strengthDiv.textContent = 'Strong password!';
            }
        });

        // Password confirmation checker
        document.getElementById('confirmPassword').addEventListener('input', function() {
            const password = document.getElementById('password').value;
            const confirmPassword = this.value;
            const matchDiv = document.getElementById('passwordMatch');
            
            if (confirmPassword === '') {
                matchDiv.textContent = '';
                return;
            }
            
            if (password === confirmPassword) {
                matchDiv.className = 'mt-1 text-success';
                matchDiv.textContent = 'Passwords match!';
            } else {
                matchDiv.className = 'mt-1 text-danger';
                matchDiv.textContent = 'Passwords do not match';
            }
        });

        // Username validation
        document.getElementById('username').addEventListener('input', function() {
            const username = this.value;
            const errorDiv = document.getElementById('usernameError');
            
            if (username.length === 0) {
                errorDiv.style.display = 'none';
                return;
            }
            
            if (username.length < 3) {
                errorDiv.textContent = 'Username must be at least 3 characters long';
                errorDiv.style.display = 'block';
            } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
                errorDiv.textContent = 'Username can only contain letters, numbers, and underscores';
                errorDiv.style.display = 'block';
            } else {
                errorDiv.style.display = 'none';
            }
        });

        // Handle signup form submission
        document.getElementById('signupForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const userType = document.getElementById('userType').value;
            
            // Validation
            if (!userType) {
                alert('Please select your user type');
                return;
            }
            
            if (username.length < 3) {
                alert('Username must be at least 3 characters long');
                return;
            }
            
            if (password !== confirmPassword) {
                alert('Passwords do not match');
                return;
            }
            
            if (password.length < 6) {
                alert('Password must be at least 6 characters long');
                return;
            }
            
                try {
                    // Send data to Flask backend
                    const response = await fetch('/signup', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: new URLSearchParams({
                            'username': username,
                            'password': password,
                            'confirm_password': confirmPassword,
                            'user_type': userType
                        })
                    });

                    if (response.redirected) {
                        // Follow Flask's redirect
                        window.location.href = response.url;
                    } else {
                        const result = await response.json();
                        if (response.ok) {
                            window.location.href = '/signin';  // Use Flask route, not .html
                        } else {
                            alert(result.error || 'Signup failed');
                        }
                    }
                } catch (error) {
                    console.error('Error:', error);
                    alert('Network error during signup');
                }
        });
