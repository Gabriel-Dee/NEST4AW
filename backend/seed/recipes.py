"""Seeded recipe library. Product keys match the golden catalog, not live UUIDs."""

PANTRY = ("water", "black pepper", "dried herbs", "vinegar")

TEMPLATES = [
    {
        "slug": "sliced-banana",
        "title": "Sliced banana",
        "description": "One labeled serving of banana.",
        "time_min": 5,
        "difficulty": "easy",
        "tags": ["low-sodium", "diabetes-friendly", "kidney-friendly"],
        "steps": ["Rinse and peel the banana.", "Slice and serve."],
        "pantry_staples": ["water"],
        "ingredients": [
            {
                "product_key": "P-173944",
                "name": "banana",
                "amount": "1 serving",
                "category": "produce",
            }
        ],
    },
    {
        "slug": "orange-juice-glass",
        "title": "Orange juice glass",
        "description": "One labeled serving of orange juice.",
        "time_min": 2,
        "difficulty": "easy",
        "tags": ["low-sodium"],
        "steps": ["Pour one labeled serving.", "Serve cold."],
        "pantry_staples": [],
        "ingredients": [
            {
                "product_key": "P-171354",
                "name": "orange juice",
                "amount": "1 serving",
                "category": "juice",
            }
        ],
    },
    {
        "slug": "tomato-basil-soup",
        "title": "Tomato basil soup",
        "description": "Heated canned tomato soup.",
        "time_min": 10,
        "difficulty": "easy",
        "tags": ["low-sodium"],
        "steps": ["Heat the soup as the label directs.", "Serve."],
        "pantry_staples": ["water"],
        "ingredients": [
            {
                "product_key": "00041196419429",
                "name": "tomato soup",
                "amount": "1 serving",
                "category": "soup",
            }
        ],
    },
    {
        "slug": "vegetable-soup",
        "title": "Vegetable soup",
        "description": "Heated lower-sodium vegetable soup.",
        "time_min": 10,
        "difficulty": "easy",
        "tags": ["low-sodium", "diabetes-friendly", "kidney-friendly"],
        "steps": ["Heat the soup as the label directs.", "Serve."],
        "pantry_staples": ["dried herbs"],
        "ingredients": [
            {
                "product_key": "767335077793",
                "name": "vegetable soup",
                "amount": "1 serving",
                "category": "soup",
            }
        ],
    },
    {
        "slug": "cocoa-cookie",
        "title": "Cocoa cookie",
        "description": "One labeled cookie serving.",
        "time_min": 1,
        "difficulty": "easy",
        "tags": ["low-sodium", "diabetes-friendly", "kidney-friendly"],
        "steps": ["Place one serving on a plate.", "Serve."],
        "pantry_staples": ["water"],
        "ingredients": [
            {
                "product_key": "FIXTURE-COOKIES-SF",
                "name": "cocoa cookies",
                "amount": "1 serving",
                "category": "snack",
            }
        ],
    },
    {
        "slug": "peanut-oat-bar",
        "title": "Peanut oat bar",
        "description": "One labeled peanut bar.",
        "time_min": 1,
        "difficulty": "easy",
        "tags": ["low-sodium"],
        "steps": ["Unwrap one bar.", "Serve."],
        "pantry_staples": ["water"],
        "ingredients": [
            {
                "product_key": "FIXTURE-BAR-PEANUT",
                "name": "peanut bar",
                "amount": "1 serving",
                "category": "snack",
            }
        ],
    },
    {
        "slug": "banana-and-cookie",
        "title": "Banana and cookie",
        "description": "Banana with one cookie serving.",
        "time_min": 5,
        "difficulty": "easy",
        "tags": ["low-sodium", "diabetes-friendly"],
        "steps": ["Slice the banana.", "Add the cookie serving and serve."],
        "pantry_staples": ["water"],
        "ingredients": [
            {
                "product_key": "P-173944",
                "name": "banana",
                "amount": "1 serving",
                "category": "produce",
            },
            {
                "product_key": "FIXTURE-COOKIES-SF",
                "name": "cocoa cookies",
                "amount": "1 serving",
                "category": "snack",
            },
        ],
    },
    {
        "slug": "soup-and-banana",
        "title": "Soup and banana",
        "description": "Vegetable soup with banana.",
        "time_min": 10,
        "difficulty": "easy",
        "tags": ["low-sodium", "diabetes-friendly"],
        "steps": ["Heat the soup as the label directs.", "Serve with the sliced banana."],
        "pantry_staples": ["dried herbs"],
        "ingredients": [
            {
                "product_key": "767335077793",
                "name": "vegetable soup",
                "amount": "1 serving",
                "category": "soup",
            },
            {
                "product_key": "P-173944",
                "name": "banana",
                "amount": "1 serving",
                "category": "produce",
            },
        ],
    },
    {
        "slug": "juice-and-banana",
        "title": "Juice and banana",
        "description": "Orange juice with banana.",
        "time_min": 5,
        "difficulty": "easy",
        "tags": ["low-sodium"],
        "steps": ["Pour the juice.", "Slice the banana and serve both."],
        "pantry_staples": [],
        "ingredients": [
            {
                "product_key": "P-171354",
                "name": "orange juice",
                "amount": "1 serving",
                "category": "juice",
            },
            {
                "product_key": "P-173944",
                "name": "banana",
                "amount": "1 serving",
                "category": "produce",
            },
        ],
    },
    {
        "slug": "cookie-and-peanut-bar",
        "title": "Cookie and peanut bar",
        "description": "Cookie serving with a peanut bar.",
        "time_min": 2,
        "difficulty": "easy",
        "tags": ["low-sodium"],
        "steps": ["Plate the cookie serving and the bar.", "Serve."],
        "pantry_staples": ["water"],
        "ingredients": [
            {
                "product_key": "FIXTURE-COOKIES-SF",
                "name": "cocoa cookies",
                "amount": "1 serving",
                "category": "snack",
            },
            {
                "product_key": "FIXTURE-BAR-PEANUT",
                "name": "peanut bar",
                "amount": "1 serving",
                "category": "snack",
            },
        ],
    },
    {
        "slug": "produce-plate",
        "title": "Produce plate",
        "description": "Whatever fresh produce is green today.",
        "time_min": 5,
        "difficulty": "easy",
        "tags": ["low-sodium", "diabetes-friendly", "kidney-friendly"],
        "steps": ["Rinse the produce.", "Slice and serve."],
        "pantry_staples": ["water", "black pepper"],
        "ingredients": [
            {
                "product_key": "",
                "name": "fresh produce",
                "amount": "1 serving",
                "category": "produce",
            }
        ],
    },
    {
        "slug": "snack-plate",
        "title": "Snack plate",
        "description": "One in-stock snack serving.",
        "time_min": 2,
        "difficulty": "easy",
        "tags": ["low-sodium", "diabetes-friendly", "kidney-friendly"],
        "steps": ["Place one serving on a plate.", "Serve."],
        "pantry_staples": ["water"],
        "ingredients": [
            {"product_key": "", "name": "snack", "amount": "1 serving", "category": "snack"}
        ],
    },
    {
        "slug": "soup-bowl",
        "title": "Soup bowl",
        "description": "One in-stock soup serving.",
        "time_min": 10,
        "difficulty": "easy",
        "tags": ["low-sodium", "kidney-friendly"],
        "steps": ["Heat the soup as the label directs.", "Serve."],
        "pantry_staples": ["dried herbs"],
        "ingredients": [
            {"product_key": "", "name": "soup", "amount": "1 serving", "category": "soup"}
        ],
    },
    {
        "slug": "juice-glass",
        "title": "Juice glass",
        "description": "One in-stock juice serving.",
        "time_min": 2,
        "difficulty": "easy",
        "tags": ["low-sodium"],
        "steps": ["Pour one labeled serving.", "Serve cold."],
        "pantry_staples": [],
        "ingredients": [
            {"product_key": "", "name": "juice", "amount": "1 serving", "category": "juice"}
        ],
    },
    {
        "slug": "produce-and-snack",
        "title": "Produce and snack",
        "description": "Produce beside a snack serving.",
        "time_min": 5,
        "difficulty": "easy",
        "tags": ["low-sodium", "diabetes-friendly"],
        "steps": ["Prepare the produce.", "Add the snack serving and serve."],
        "pantry_staples": ["water"],
        "ingredients": [
            {
                "product_key": "",
                "name": "fresh produce",
                "amount": "1 serving",
                "category": "produce",
            },
            {"product_key": "", "name": "snack", "amount": "1 serving", "category": "snack"},
        ],
    },
    {
        "slug": "soup-and-snack",
        "title": "Soup and snack",
        "description": "Soup with a snack serving.",
        "time_min": 10,
        "difficulty": "medium",
        "tags": ["low-sodium"],
        "steps": ["Heat the soup as the label directs.", "Serve with the snack."],
        "pantry_staples": ["dried herbs", "water"],
        "ingredients": [
            {"product_key": "", "name": "soup", "amount": "1 serving", "category": "soup"},
            {"product_key": "", "name": "snack", "amount": "1 serving", "category": "snack"},
        ],
    },
    {
        "slug": "banana-cookie-water",
        "title": "Banana cookie plate",
        "description": "Banana and cookie, with water on the side.",
        "time_min": 5,
        "difficulty": "easy",
        "tags": ["low-sodium", "diabetes-friendly", "kidney-friendly"],
        "steps": ["Slice the banana.", "Add the cookie serving.", "Serve with water."],
        "pantry_staples": ["water"],
        "ingredients": [
            {
                "product_key": "P-173944",
                "name": "banana",
                "amount": "1 serving",
                "category": "produce",
            },
            {
                "product_key": "FIXTURE-COOKIES-SF",
                "name": "cocoa cookies",
                "amount": "1 serving",
                "category": "snack",
            },
        ],
    },
    {
        "slug": "herbed-vegetable-soup",
        "title": "Herbed vegetable soup",
        "description": "Vegetable soup finished with dried herbs.",
        "time_min": 12,
        "difficulty": "easy",
        "tags": ["low-sodium", "diabetes-friendly", "kidney-friendly"],
        "steps": ["Heat the soup as the label directs.", "Stir in dried herbs and serve."],
        "pantry_staples": ["dried herbs", "black pepper"],
        "ingredients": [
            {
                "product_key": "767335077793",
                "name": "vegetable soup",
                "amount": "1 serving",
                "category": "soup",
            }
        ],
    },
    {
        "slug": "cookie-with-herbs",
        "title": "Cookie plate",
        "description": "Cookie serving with water.",
        "time_min": 2,
        "difficulty": "easy",
        "tags": ["low-sodium", "diabetes-friendly", "kidney-friendly"],
        "steps": ["Plate one cookie serving.", "Serve with water."],
        "pantry_staples": ["water", "vinegar"],
        "ingredients": [
            {
                "product_key": "FIXTURE-COOKIES-SF",
                "name": "cocoa cookies",
                "amount": "1 serving",
                "category": "snack",
            }
        ],
    },
    {
        "slug": "peanut-and-banana",
        "title": "Peanut bar and banana",
        "description": "Peanut bar with banana.",
        "time_min": 5,
        "difficulty": "easy",
        "tags": ["low-sodium"],
        "steps": ["Slice the banana.", "Serve with the peanut bar."],
        "pantry_staples": ["water"],
        "ingredients": [
            {
                "product_key": "FIXTURE-BAR-PEANUT",
                "name": "peanut bar",
                "amount": "1 serving",
                "category": "snack",
            },
            {
                "product_key": "P-173944",
                "name": "banana",
                "amount": "1 serving",
                "category": "produce",
            },
        ],
    },
    {
        "slug": "green-snack-box",
        "title": "Green snack box",
        "description": "A snack that stayed green for this plan.",
        "time_min": 2,
        "difficulty": "easy",
        "tags": ["low-sodium", "diabetes-friendly", "kidney-friendly"],
        "steps": ["Choose the resolved snack serving.", "Serve."],
        "pantry_staples": ["water"],
        "ingredients": [
            {
                "product_key": "FIXTURE-COOKIES-SF",
                "name": "cocoa cookies",
                "amount": "1 serving",
                "category": "snack",
            }
        ],
    },
    {
        "slug": "soup-produce-snack",
        "title": "Soup, produce, and snack",
        "description": "Three labeled servings from different shelves.",
        "time_min": 15,
        "difficulty": "medium",
        "tags": ["low-sodium", "diabetes-friendly"],
        "steps": ["Heat the soup.", "Prepare the produce.", "Add the snack and serve."],
        "pantry_staples": ["water", "dried herbs"],
        "ingredients": [
            {"product_key": "", "name": "soup", "amount": "1 serving", "category": "soup"},
            {
                "product_key": "",
                "name": "fresh produce",
                "amount": "1 serving",
                "category": "produce",
            },
            {"product_key": "", "name": "snack", "amount": "1 serving", "category": "snack"},
        ],
    },
    {
        "slug": "pepper-banana",
        "title": "Pepper banana",
        "description": "Sliced banana with black pepper.",
        "time_min": 5,
        "difficulty": "easy",
        "tags": ["low-sodium", "diabetes-friendly", "kidney-friendly"],
        "steps": ["Slice the banana.", "Add black pepper if wanted and serve."],
        "pantry_staples": ["black pepper"],
        "ingredients": [
            {
                "product_key": "P-173944",
                "name": "banana",
                "amount": "1 serving",
                "category": "produce",
            }
        ],
    },
    {
        "slug": "vinegar-snack",
        "title": "Snack with vinegar",
        "description": "Snack serving. Vinegar stays on the side.",
        "time_min": 3,
        "difficulty": "easy",
        "tags": ["low-sodium", "diabetes-friendly", "kidney-friendly"],
        "steps": ["Plate the snack.", "Offer vinegar on the side."],
        "pantry_staples": ["vinegar", "water"],
        "ingredients": [
            {
                "product_key": "FIXTURE-COOKIES-SF",
                "name": "cocoa cookies",
                "amount": "1 serving",
                "category": "snack",
            }
        ],
    },
]


def seed_library(conn):
    for template in TEMPLATES:
        row = conn.execute(
            """INSERT INTO recipes_library
            (slug,title,description,time_min,difficulty,tags,why_good_for_you,steps,pantry_staples)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON CONFLICT (slug) DO NOTHING RETURNING id""",
            (
                template["slug"],
                template["title"],
                template["description"],
                template["time_min"],
                template["difficulty"],
                template["tags"],
                "Recorded rules decide whether this plate is shown.",
                template["steps"],
                [item for item in template["pantry_staples"] if item in PANTRY],
            ),
        ).fetchone()
        if not row:
            continue
        for index, ingredient in enumerate(template["ingredients"]):
            conn.execute(
                """INSERT INTO recipe_library_ingredients
                (recipe_id,sort_order,product_key,name,amount,category)
                VALUES (%s,%s,%s,%s,%s,%s)""",
                (
                    row["id"],
                    index,
                    ingredient["product_key"],
                    ingredient["name"],
                    ingredient["amount"],
                    ingredient["category"],
                ),
            )
