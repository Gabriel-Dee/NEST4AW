import { products, recipes, session, type Group, type Product, type Recipe, type Session, type Verdict } from '../data/mock';

export type { Group, Product, Recipe, Session, Verdict };

export type CartLine = {
  product: Product;
  qty: number;
};

export type CartSnapshot = {
  lines: CartLine[];
  great: number;
  limit: number;
  points: number;
  greensInCart: number;
  greenGoal: number;
  listComplete: boolean;
};

export type RecipeCard = Recipe & {
  usesFromCart: number;
  missing: Product | null;
  saved: boolean;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let lines: CartLine[] = [];
let points = 0;
let savedIds: string[] = [];
let recipePointGiven = false;

const greenGoal = products.filter((item) => item.verdict === 'green').length;

function findProduct(sku: string) {
  const key = sku.trim().toUpperCase();
  return products.find((item) => item.sku === key) ?? null;
}

function greensInCart() {
  return lines.filter((line) => line.product.verdict === 'green').length;
}

export async function getSession(): Promise<Session & { points: number; greensInCart: number; greenGoal: number }> {
  await wait(220);
  return { ...session, points, greensInCart: greensInCart(), greenGoal };
}

export async function getRecommendations(): Promise<Product[]> {
  await wait(280);
  return products;
}

export async function scanItem(sku: string): Promise<Product | null> {
  await wait(250);
  return findProduct(sku);
}

export async function getCart(): Promise<CartSnapshot> {
  await wait(180);
  const great = lines.filter((line) => line.product.verdict === 'green').length;
  const limit = lines.filter((line) => line.product.verdict === 'yellow').length;
  const picked = greensInCart();
  return {
    lines: [...lines],
    great,
    limit,
    points,
    greensInCart: picked,
    greenGoal,
    listComplete: picked >= greenGoal && greenGoal > 0,
  };
}

export async function addToCart(sku: string): Promise<{ added: boolean; product: Product | null }> {
  await wait(180);
  const product = findProduct(sku);
  if (!product || product.verdict === 'red') {
    return { added: false, product };
  }
  const existing = lines.find((line) => line.product.sku === product.sku);
  if (existing) {
    return { added: true, product };
  }
  lines = [...lines, { product, qty: product.suggestedQty > 0 ? product.suggestedQty : 1 }];
  if (product.verdict === 'green') {
    points += 1;
  }
  return { added: true, product };
}

export async function getRecipes(): Promise<RecipeCard[]> {
  await wait(700);
  const inCart = new Set(lines.map((line) => line.product.sku));
  return recipes.map((recipe) => ({
    ...recipe,
    usesFromCart: recipe.ingredientSkus.filter((sku) => inCart.has(sku)).length,
    missing: findProduct(recipe.missingSku),
    saved: savedIds.includes(recipe.id),
  }));
}

export async function saveRecipe(id: string): Promise<{ saved: boolean; firstSave: boolean }> {
  await wait(200);
  if (savedIds.includes(id)) {
    return { saved: true, firstSave: false };
  }
  savedIds = [...savedIds, id];
  const firstSave = !recipePointGiven;
  if (firstSave) {
    recipePointGiven = true;
    points += 1;
  }
  return { saved: true, firstSave };
}

export async function getSavedRecipes(): Promise<Recipe[]> {
  await wait(160);
  return recipes.filter((recipe) => savedIds.includes(recipe.id));
}

export function locationLabel(product: Pick<Product, 'aisle' | 'shelf' | 'bin'>) {
  return `Aisle ${product.aisle} · Shelf ${product.shelf} · Bin ${product.bin}`;
}
