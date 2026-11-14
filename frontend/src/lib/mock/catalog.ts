import type { Product } from "@/lib/types";

const CATEGORIES = [
  "produce",
  "dairy",
  "protein",
  "grains",
  "pantry",
  "frozen",
  "beverages",
] as const;

const AISLES = ["A", "B", "C", "D", "E"] as const;

const BASE_NAMES: Record<(typeof CATEGORIES)[number], string[]> = {
  produce: [
    "Bananas",
    "Baby spinach",
    "Carrots",
    "Apples",
    "Broccoli florets",
    "Cucumber",
    "Bell peppers",
    "Blueberries",
    "Kale",
    "Zucchini",
  ],
  dairy: [
    "Low-fat milk",
    "Greek yogurt plain",
    "Cottage cheese",
    "Cheddar reduced-sodium",
    "Plant oat milk",
    "Lactose-free milk",
  ],
  protein: [
    "Chicken breast",
    "Canned tuna water",
    "Black beans",
    "Lentils dry",
    "Eggs large",
    "Turkey slices low-sodium",
    "Tofu firm",
    "Salmon pouch",
  ],
  grains: [
    "Brown rice",
    "Oats rolled",
    "Whole wheat bread",
    "Quinoa",
    "Corn tortillas",
    "Barley",
  ],
  pantry: [
    "No-salt canned tomatoes",
    "Olive oil",
    "Peanut butter",
    "Canned soup cream",
    "Crackers salted",
    "Pasta sauce classic",
    "Honey",
    "Chickpeas",
  ],
  frozen: [
    "Frozen mixed vegetables",
    "Frozen berries",
    "Frozen fish fillets",
    "Frozen peas",
  ],
  beverages: [
    "Orange juice",
    "Sparkling water",
    "Apple juice box",
    "Sports drink",
    "Herbal tea bags",
  ],
};

function pad(n: number) {
  return String(n).padStart(3, "0");
}

function dateOffset(daysFromToday: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  return d.toISOString().slice(0, 10);
}

/** ~100-item warehouse catalog with bin locations and nutrition flags. */
export function buildCatalog(): Product[] {
  const items: Product[] = [];
  let i = 0;

  for (const category of CATEGORIES) {
    for (const name of BASE_NAMES[category]) {
      for (let variant = 0; variant < (category === "produce" ? 2 : 1); variant++) {
        i += 1;
        if (i > 100) break;
        const aisle = AISLES[i % AISLES.length];
        const shelf = String((i % 4) + 1);
        const isDrink = category === "beverages";
        const highSodium =
          name.includes("salt") ||
          name.includes("soup") ||
          name.includes("Crackers") ||
          name.includes("sauce");
        const sugaryDrink =
          isDrink && (name.includes("juice") || name.includes("Sports"));

        const product: Product = {
          id: `prod-${pad(i)}`,
          name: variant ? `${name} (family pack)` : name,
          category,
          barcode: isDrink || category === "pantry" ? `0040000${pad(i)}` : null,
          internal_code: `${aisle}-${pad(i)}`,
          stock: highSodium ? 4 + (i % 6) : 12 + (i % 40),
          aisle,
          shelf,
          bin_code: `${aisle}${shelf}-${pad(i % 20)}`,
          batch_arrived: dateOffset(-14 - (i % 20)),
          expires_on: dateOffset(i % 3 === 0 ? 4 : 21 + (i % 40)),
          sodium_mg: sugaryDrink
            ? 20
            : highSodium
              ? 520 + (i % 200)
              : 20 + (i % 120),
          potassium_mg: category === "produce" ? 200 + (i % 200) : 80 + (i % 100),
          phosphorus_mg: category === "dairy" ? 120 + (i % 80) : 40 + (i % 60),
          added_sugar_g: sugaryDrink ? 12 + (i % 8) : highSodium ? 3 : 0,
          carb_g: isDrink ? 28 : 10 + (i % 30),
          allergens: name.toLowerCase().includes("milk")
            ? ["milk"]
            : name.toLowerCase().includes("peanut")
              ? ["peanuts"]
              : name.toLowerCase().includes("bread")
                ? ["wheat"]
                : [],
          is_drink: isDrink,
          weight_lb: Number((0.4 + (i % 10) * 0.15).toFixed(2)),
        };

        if (highSodium || sugaryDrink) {
          product.swap_suggestions = [
            {
              id: `swap-${pad(i)}-a`,
              name: "No-salt canned tomatoes",
              location: "Aisle A / Shelf 2 / A2-03",
            },
            {
              id: `swap-${pad(i)}-b`,
              name: "Sparkling water",
              location: "Aisle E / Shelf 1 / E1-08",
            },
          ];
        }

        items.push(product);
      }
      if (i > 100) break;
    }
    if (i > 100) break;
  }

  while (items.length < 100) {
    const n = items.length + 1;
    const aisle = AISLES[n % AISLES.length];
    items.push({
      id: `prod-${pad(n)}`,
      name: `Staple item ${n}`,
      category: "pantry",
      barcode: `0090000${pad(n)}`,
      internal_code: `${aisle}-${pad(n)}`,
      stock: 20,
      aisle,
      shelf: "2",
      bin_code: `${aisle}2-${pad(n % 15)}`,
      batch_arrived: dateOffset(-10),
      expires_on: dateOffset(45),
      sodium_mg: 80,
      potassium_mg: 90,
      phosphorus_mg: 50,
      added_sugar_g: 0,
      carb_g: 18,
      allergens: [],
      is_drink: false,
      weight_lb: 1,
    });
  }

  return items.slice(0, 100);
}

export const CATALOG = buildCatalog();

export function getProductByCode(code: string): Product | undefined {
  const q = code.trim().toLowerCase();
  return CATALOG.find(
    (p) =>
      p.barcode?.toLowerCase() === q ||
      p.internal_code.toLowerCase() === q ||
      p.id.toLowerCase() === q ||
      p.name.toLowerCase().includes(q),
  );
}
