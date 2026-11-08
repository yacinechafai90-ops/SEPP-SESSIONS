"""Print a password hash for the SEPP_ADMIN_PASSWORD_HASH Render setting."""
from getpass import getpass
from werkzeug.security import generate_password_hash

password=getpass('New online administrator password: ')
if len(password)<12:
    raise SystemExit('Use at least 12 characters.')
print(generate_password_hash(password))
