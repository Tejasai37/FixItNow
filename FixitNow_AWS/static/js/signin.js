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

        // Handle signin form submission
        document.getElementById('signinForm').addEventListener('submit', function(e) {
            
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            const userType = document.getElementById('userType').value;
            
            // Validate that user type is selected
            if (!userType) {
                e.preventDefault();
                alert('Please select your user type');
                return;
            }
            
                // Validate username and password
            if (!username || !password) {
                e.preventDefault();
                alert('Please enter both username and password');
                return;
            }


            console.log('Signin attempt:', { username, userType });
            
            
        });