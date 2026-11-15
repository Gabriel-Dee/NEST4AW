from app.auth import require_role

doctor_or_admin = require_role("doctor", "admin")
staff_or_admin = require_role("warehouse_staff", "admin")
partner_or_admin = require_role("community_partner", "admin")
admin_only = require_role("admin")
client_only = require_role("client")
any_user = require_role("doctor", "client", "warehouse_staff", "admin", "community_partner")
