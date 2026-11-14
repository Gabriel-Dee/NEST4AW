export type Verdict = 'green' | 'yellow' | 'red';

export type Group = 'Produce' | 'Proteins' | 'Dairy' | 'Grains' | 'Pantry';

export type Product = {
  sku: string;
  name: string;
  group: Group;
  verdict: Verdict;
  reason: string;
  sodiumMg: number;
  sugarG: number;
  potassiumMg: number;
  carbsG: number;
  aisle: string;
  shelf: string;
  bin: string;
  suggestedQty: number;
  icon: 'leaf' | 'nutrition' | 'fish' | 'egg' | 'cafe' | 'grid' | 'cube' | 'water';
  alternativeSkus: string[];
};

export type Session = {
  id: string;
  firstName: string;
  householdSize: number;
  planBadge: string;
  conditionsLabel: string;
  streakLabel: string;
  guides: {
    sodiumMg: number;
    addedSugarG: number;
    potassiumMg: number;
    carbsG: number;
  };
};

export type Recipe = {
  id: string;
  title: string;
  minutes: number;
  icon: Product['icon'];
  ingredientSkus: string[];
  missingSku: string;
};

export const session: Session = {
  id: 'session-maria',
  firstName: 'Maria',
  householdSize: 3,
  planBadge: 'Heart & Kidney Friendly',
  conditionsLabel: 'Type 2 Diabetes + Hypertension',
  streakLabel: '3 visits with healthy carts',
  guides: {
    sodiumMg: 460,
    addedSugarG: 0.5,
    potassiumMg: 1000,
    carbsG: 30,
  },
};

export const products: Product[] = [
  { sku: 'SPINACH', name: 'Fresh spinach', group: 'Produce', verdict: 'green', reason: 'Low sodium, and it fits today.', sodiumMg: 79, sugarG: 0.4, potassiumMg: 558, carbsG: 3.6, aisle: 'A', shelf: '1', bin: '2', suggestedQty: 2, icon: 'leaf', alternativeSkus: [] },
  { sku: 'BANANA', name: 'Banana', group: 'Produce', verdict: 'green', reason: 'A whole fruit that fits today.', sodiumMg: 1, sugarG: 0, potassiumMg: 358, carbsG: 23, aisle: 'A', shelf: '1', bin: '3', suggestedQty: 3, icon: 'leaf', alternativeSkus: [] },
  { sku: 'CARROT', name: 'Carrots', group: 'Produce', verdict: 'green', reason: 'Low sodium produce.', sodiumMg: 69, sugarG: 0, potassiumMg: 320, carbsG: 10, aisle: 'A', shelf: '1', bin: '4', suggestedQty: 2, icon: 'leaf', alternativeSkus: [] },
  { sku: 'APPLE', name: 'Apples', group: 'Produce', verdict: 'green', reason: 'Whole fruit. A steady choice.', sodiumMg: 1, sugarG: 0, potassiumMg: 107, carbsG: 14, aisle: 'A', shelf: '1', bin: '1', suggestedQty: 3, icon: 'leaf', alternativeSkus: [] },
  { sku: 'BROCCOLI', name: 'Broccoli', group: 'Produce', verdict: 'green', reason: 'Low sodium produce.', sodiumMg: 33, sugarG: 0, potassiumMg: 316, carbsG: 7, aisle: 'A', shelf: '2', bin: '2', suggestedQty: 2, icon: 'leaf', alternativeSkus: [] },
  { sku: 'OJ', name: 'Orange juice', group: 'Produce', verdict: 'red', reason: "Fruit juice isn't part of the plan today", sodiumMg: 0, sugarG: 8.3, potassiumMg: 184, carbsG: 10, aisle: 'A', shelf: '2', bin: '1', suggestedQty: 0, icon: 'water', alternativeSkus: ['APPLE', 'SPINACH'] },
  { sku: 'TUNA', name: 'Canned tuna in water', group: 'Proteins', verdict: 'yellow', reason: 'Sodium is in the middle. One can is plenty.', sodiumMg: 320, sugarG: 0, potassiumMg: 237, carbsG: 0, aisle: 'C', shelf: '1', bin: '1', suggestedQty: 1, icon: 'fish', alternativeSkus: ['CHICKEN'] },
  { sku: 'EGGS', name: 'Eggs', group: 'Proteins', verdict: 'green', reason: 'A simple protein for the household.', sodiumMg: 62, sugarG: 0, potassiumMg: 63, carbsG: 0.4, aisle: 'C', shelf: '2', bin: '1', suggestedQty: 1, icon: 'egg', alternativeSkus: [] },
  { sku: 'CHICKEN', name: 'Chicken breast', group: 'Proteins', verdict: 'green', reason: 'Low sodium protein.', sodiumMg: 45, sugarG: 0, potassiumMg: 256, carbsG: 0, aisle: 'C', shelf: '1', bin: '2', suggestedQty: 2, icon: 'nutrition', alternativeSkus: [] },
  { sku: 'PEANUT', name: 'Unsalted peanut butter', group: 'Proteins', verdict: 'green', reason: 'No added salt.', sodiumMg: 5, sugarG: 1.5, potassiumMg: 180, carbsG: 7, aisle: 'C', shelf: '3', bin: '2', suggestedQty: 1, icon: 'nutrition', alternativeSkus: [] },
  { sku: 'LENTILS', name: 'Dry lentils', group: 'Proteins', verdict: 'green', reason: 'A low sodium protein.', sodiumMg: 2, sugarG: 0, potassiumMg: 369, carbsG: 20, aisle: 'C', shelf: '3', bin: '1', suggestedQty: 2, icon: 'nutrition', alternativeSkus: [] },
  { sku: 'SALMON', name: 'Canned salmon', group: 'Proteins', verdict: 'yellow', reason: 'Sodium is in the middle. One can is plenty.', sodiumMg: 360, sugarG: 0, potassiumMg: 320, carbsG: 0, aisle: 'C', shelf: '2', bin: '2', suggestedQty: 1, icon: 'fish', alternativeSkus: ['CHICKEN'] },
  { sku: 'YOGURT', name: 'Plain yogurt', group: 'Dairy', verdict: 'green', reason: 'Unsweetened and low sodium.', sodiumMg: 50, sugarG: 0, potassiumMg: 141, carbsG: 5, aisle: 'D', shelf: '1', bin: '1', suggestedQty: 2, icon: 'cafe', alternativeSkus: [] },
  { sku: 'MILK', name: 'Low-fat milk', group: 'Dairy', verdict: 'green', reason: 'Low sodium dairy.', sodiumMg: 107, sugarG: 0, potassiumMg: 150, carbsG: 12, aisle: 'D', shelf: '1', bin: '2', suggestedQty: 1, icon: 'cafe', alternativeSkus: [] },
  { sku: 'CHEDDAR', name: 'Cheddar cheese', group: 'Dairy', verdict: 'yellow', reason: 'Sodium adds up. A small amount is enough.', sodiumMg: 180, sugarG: 0.1, potassiumMg: 28, carbsG: 0.4, aisle: 'D', shelf: '2', bin: '1', suggestedQty: 1, icon: 'cafe', alternativeSkus: ['YOGURT'] },
  { sku: 'RICE', name: 'Brown rice', group: 'Grains', verdict: 'green', reason: 'A calm staple.', sodiumMg: 5, sugarG: 0, potassiumMg: 86, carbsG: 23, aisle: 'B', shelf: '3', bin: '1', suggestedQty: 2, icon: 'grid', alternativeSkus: [] },
  { sku: 'OATS', name: 'Rolled oats', group: 'Grains', verdict: 'green', reason: 'A calm breakfast grain.', sodiumMg: 2, sugarG: 0, potassiumMg: 143, carbsG: 27, aisle: 'B', shelf: '3', bin: '2', suggestedQty: 2, icon: 'grid', alternativeSkus: [] },
  { sku: 'BREAD', name: 'Whole wheat bread', group: 'Grains', verdict: 'yellow', reason: 'Sodium is in the middle. One loaf is plenty.', sodiumMg: 230, sugarG: 2, potassiumMg: 80, carbsG: 20, aisle: 'B', shelf: '1', bin: '1', suggestedQty: 1, icon: 'grid', alternativeSkus: ['RICE', 'OATS'] },
  { sku: 'QUINOA', name: 'Quinoa', group: 'Grains', verdict: 'green', reason: 'A low sodium grain.', sodiumMg: 7, sugarG: 0, potassiumMg: 172, carbsG: 21, aisle: 'B', shelf: '3', bin: '3', suggestedQty: 2, icon: 'grid', alternativeSkus: [] },
  { sku: 'BEANS', name: 'Low-sodium black beans', group: 'Pantry', verdict: 'green', reason: 'Low sodium and useful for the household.', sodiumMg: 140, sugarG: 0.3, potassiumMg: 370, carbsG: 20, aisle: 'B', shelf: '2', bin: '4', suggestedQty: 3, icon: 'cube', alternativeSkus: [] },
  { sku: 'SOUP', name: 'Canned chicken noodle soup', group: 'Pantry', verdict: 'red', reason: 'High sodium – 890mg', sodiumMg: 890, sugarG: 1, potassiumMg: 120, carbsG: 12, aisle: 'B', shelf: '2', bin: '1', suggestedQty: 0, icon: 'cube', alternativeSkus: ['BEANS', 'RICE'] },
  { sku: 'TOMATOES', name: 'Canned diced tomatoes', group: 'Pantry', verdict: 'yellow', reason: 'Sodium is in the middle. One can is plenty.', sodiumMg: 300, sugarG: 4, potassiumMg: 210, carbsG: 7, aisle: 'B', shelf: '2', bin: '3', suggestedQty: 1, icon: 'cube', alternativeSkus: ['BEANS'] },
  { sku: 'SEASON', name: 'No-salt seasoning', group: 'Pantry', verdict: 'green', reason: 'Flavor without the salt.', sodiumMg: 0, sugarG: 0, potassiumMg: 40, carbsG: 1, aisle: 'B', shelf: '4', bin: '1', suggestedQty: 1, icon: 'cube', alternativeSkus: [] },
  { sku: 'OIL', name: 'Olive oil', group: 'Pantry', verdict: 'green', reason: 'No sodium.', sodiumMg: 0, sugarG: 0, potassiumMg: 0, carbsG: 0, aisle: 'B', shelf: '4', bin: '2', suggestedQty: 1, icon: 'cube', alternativeSkus: [] },
  { sku: 'SODA', name: 'Cola', group: 'Pantry', verdict: 'red', reason: "A sugary drink isn't part of the plan today", sodiumMg: 45, sugarG: 39, potassiumMg: 0, carbsG: 39, aisle: 'B', shelf: '5', bin: '1', suggestedQty: 0, icon: 'water', alternativeSkus: ['APPLE', 'OATS'] },
];

export const recipes: Recipe[] = [
  {
    id: 'beans-rice',
    title: 'Beans, rice, and spinach',
    minutes: 25,
    icon: 'cube',
    ingredientSkus: ['BEANS', 'RICE', 'SPINACH', 'SEASON'],
    missingSku: 'OIL',
  },
  {
    id: 'oat-bowl',
    title: 'Warm oats with banana',
    minutes: 10,
    icon: 'grid',
    ingredientSkus: ['OATS', 'BANANA', 'YOGURT', 'SPINACH'],
    missingSku: 'MILK',
  },
  {
    id: 'chicken-bowl',
    title: 'Chicken and bean bowl',
    minutes: 30,
    icon: 'nutrition',
    ingredientSkus: ['CHICKEN', 'BEANS', 'RICE', 'CARROT'],
    missingSku: 'TOMATOES',
  },
];
