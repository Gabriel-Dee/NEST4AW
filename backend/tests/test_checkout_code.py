"""Exit checkout by QR or 4-digit code: staff see the shopper and cart, remove what is not
allowed, and checkout only passes once nothing red or unknown is left."""


def test_checkout_code_review_remove_and_pass(api, db):
    reg = api.post("/api/v1/auth/register", json={
        "first_name": "Code", "last_name": "Shopper", "email": "code-shopper@test.local",
        "password": "pw-test-12345", "household_size": 1, "icd10_codes": ["E11.9"], "allergies": [],
    })
    auth = {"Authorization": "Bearer " + reg.json()["access_token"]}
    epic = db.execute("SELECT * FROM stores WHERE slug='epic-cure'").fetchone()
    visit = api.post(f"/stores/{epic['id']}/check-in", headers=auth,
                     json={"lat": epic["lat"], "lng": epic["lng"], "accuracy_m": 5}).json()
    shopper = {**auth, "X-Visit-Token": visit["visit_token"]}
    oats = api.post("/api/v1/scan", headers=shopper, json={"code": "030000010402"}).json()["product"]["id"]
    assert api.post("/api/v1/cart/items", headers=shopper, json={"product_id": oats, "qty": 1}).status_code == 200
    # A red item in the cart (e.g. the plan changed after it was added): orange juice for diabetes.
    oj = db.execute("SELECT id FROM products WHERE barcode='048500205723'").fetchone()["id"]
    session_id = db.execute("SELECT id FROM visits WHERE client_id=(SELECT id FROM clients WHERE user_id="
                            "(SELECT id FROM users WHERE email='code-shopper@test.local'))").fetchone()["id"]
    db.execute("INSERT INTO cart_lines(session_id, product_id, qty, verdict) VALUES (%s,%s,1,'red')", (session_id, oj))
    db.commit()

    code = api.post("/api/v1/checkout/code", headers=shopper).json()
    assert len(code["code"]) == 4 and code["qr"] == f"NEST4AW:CHECKOUT:{code['code']}"
    assert api.post("/api/v1/checkout/code", headers=shopper).json()["code"] == code["code"]  # stable

    staff_login = api.post("/auth/login", json={"email": "staff@demo.local", "password": "nest-local-demo"})
    staff = {"Authorization": "Bearer " + staff_login.json()["token"]}
    assert api.get(f"/api/v1/staff/checkout/{code['code']}", headers=auth).status_code == 403  # shoppers can't

    view = api.get(f"/api/v1/staff/checkout/{code['qr']}", headers=staff).json()  # QR payload works too
    assert view["client"]["name"] == "Code Shopper" and view["client"]["dm"] is True
    flagged = {i["product"]["id"]: i["must_remove"] for i in view["cart"]["items"]}
    assert flagged == {oats: False, str(oj): True} and view["can_pass"] is False

    blocked = api.post("/checkout", headers=staff, json={"session_id": view["session_id"]})
    assert blocked.status_code == 409  # cannot leave with the juice

    api.delete(f"/cart/lines/{oj}", params={"session_id": view["session_id"]}, headers=staff)
    view = api.get(f"/api/v1/staff/checkout/{code['code']}", headers=staff).json()
    assert view["can_pass"] is True and len(view["cart"]["items"]) == 1
    done = api.post("/checkout", headers=staff, json={"session_id": view["session_id"]})
    assert done.status_code == 200, done.text


def test_unknown_code_is_404(api):
    staff = api.post("/auth/login", json={"email": "staff@demo.local", "password": "nest-local-demo"})
    r = api.get("/api/v1/staff/checkout/0000", headers={"Authorization": "Bearer " + staff.json()["token"]})
    assert r.status_code == 404
