// The demo catalog: apparel & accessories. Prices are integer cents.
// The six original Pocket Shop accessories are kept (same names) so existing demo scripts still read naturally.
export interface SeedProduct {
  name: string;
  category: string;
  price: number;
  compareAt?: number;
  sizes?: string[];
  colours?: string[];
  featured?: boolean;
  description: string;
}

export const CATEGORIES = [
  { slug: "tops", name: "Tops", featured: true },
  { slug: "outerwear", name: "Outerwear", featured: true },
  { slug: "bottoms", name: "Bottoms", featured: false },
  { slug: "bags", name: "Bags", featured: true },
  { slug: "accessories", name: "Accessories", featured: false },
  { slug: "bottles", name: "Bottles", featured: false },
  { slug: "notebooks", name: "Notebooks", featured: false },
];

const APPAREL = ["XS", "S", "M", "L", "XL"];

export const PRODUCTS: SeedProduct[] = [
  { name: "Canvas Tote", category: "bags", price: 2400, featured: true, description: "Heavyweight cotton canvas tote with an inside pocket." },
  { name: "Laptop Sleeve", category: "bags", price: 3200, colours: ["Charcoal", "Sand"], description: "Padded sleeve for 13–14 inch laptops." },
  { name: "Steel Bottle", category: "bottles", price: 1800, colours: ["Forest", "Slate"], description: "Insulated stainless steel bottle, 750 ml." },
  { name: "Glass Bottle", category: "bottles", price: 1500, description: "Borosilicate glass bottle with a silicone sleeve." },
  { name: "Dot Grid Notebook", category: "notebooks", price: 950, description: "A5 dot grid notebook, 160 pages." },
  { name: "Pocket Notebook", category: "notebooks", price: 450, description: "Pocket-size notebook with a lay-flat binding." },
  { name: "Everyday Tee", category: "tops", price: 2200, sizes: APPAREL, colours: ["White", "Black", "Forest"], featured: true, description: "Midweight organic cotton tee." },
  { name: "Pocket Tee", category: "tops", price: 2600, sizes: APPAREL, colours: ["Oat", "Navy"], description: "Relaxed fit tee with a chest pocket." },
  { name: "Long Sleeve Tee", category: "tops", price: 3000, sizes: APPAREL, colours: ["White", "Charcoal"], description: "Long sleeve tee in soft slub cotton." },
  { name: "Oxford Shirt", category: "tops", price: 5800, compareAt: 6800, sizes: APPAREL, colours: ["Blue", "White"], description: "Button-down oxford cloth shirt." },
  { name: "Linen Shirt", category: "tops", price: 6400, sizes: APPAREL, colours: ["Sand", "Sky"], description: "Breathable washed linen shirt." },
  { name: "Merino Crew", category: "tops", price: 8800, sizes: APPAREL, colours: ["Navy", "Oat"], featured: true, description: "Fine-gauge merino wool sweater." },
  { name: "Zip Hoodie", category: "tops", price: 6900, compareAt: 7900, sizes: APPAREL, colours: ["Grey", "Forest"], featured: true, description: "Brushed fleece zip hoodie." },
  { name: "Pullover Hoodie", category: "tops", price: 6400, sizes: APPAREL, colours: ["Black", "Oat"], description: "Heavyweight pullover hoodie with a kangaroo pocket." },
  { name: "Crewneck Sweatshirt", category: "tops", price: 5400, sizes: APPAREL, colours: ["Grey", "Navy"], description: "Loopback cotton crewneck." },
  { name: "Polo Shirt", category: "tops", price: 4200, sizes: APPAREL, colours: ["White", "Forest"], description: "Piqué cotton polo." },
  { name: "Rain Shell", category: "outerwear", price: 12800, sizes: APPAREL, colours: ["Olive", "Black"], featured: true, description: "Packable waterproof shell jacket." },
  { name: "Puffer Vest", category: "outerwear", price: 9800, compareAt: 11800, sizes: APPAREL, colours: ["Navy", "Black"], description: "Lightweight insulated vest." },
  { name: "Chore Coat", category: "outerwear", price: 14800, sizes: APPAREL, colours: ["Tan", "Indigo"], description: "Cotton canvas chore coat." },
  { name: "Denim Jacket", category: "outerwear", price: 11800, sizes: APPAREL, colours: ["Indigo"], description: "Rigid denim trucker jacket." },
  { name: "Wool Overcoat", category: "outerwear", price: 26800, sizes: ["S", "M", "L", "XL"], colours: ["Charcoal"], description: "Single-breasted wool-blend overcoat." },
  { name: "Fleece Jacket", category: "outerwear", price: 8800, sizes: APPAREL, colours: ["Cream", "Forest"], description: "High-pile fleece jacket." },
  { name: "Slim Chinos", category: "bottoms", price: 6800, sizes: ["28", "30", "32", "34", "36"], colours: ["Khaki", "Navy"], description: "Stretch cotton slim chinos." },
  { name: "Relaxed Jeans", category: "bottoms", price: 7800, sizes: ["28", "30", "32", "34", "36"], colours: ["Indigo", "Black"], featured: true, description: "Relaxed fit selvedge denim." },
  { name: "Cargo Pants", category: "bottoms", price: 7200, sizes: ["28", "30", "32", "34", "36"], colours: ["Olive"], description: "Ripstop cargo pants." },
  { name: "Drawstring Shorts", category: "bottoms", price: 4200, sizes: APPAREL, colours: ["Navy", "Sand"], description: "Cotton twill drawstring shorts." },
  { name: "Sweatpants", category: "bottoms", price: 5200, sizes: APPAREL, colours: ["Grey", "Black"], description: "Fleece-lined tapered sweatpants." },
  { name: "Wool Trousers", category: "bottoms", price: 9800, compareAt: 11800, sizes: ["30", "32", "34", "36"], colours: ["Charcoal"], description: "Tailored wool trousers." },
  { name: "Weekender Bag", category: "bags", price: 9800, colours: ["Olive", "Black"], description: "Waxed canvas weekender with leather handles." },
  { name: "Roll-top Backpack", category: "bags", price: 11800, colours: ["Black", "Forest"], featured: true, description: "Water-resistant roll-top backpack, 22 L." },
  { name: "Crossbody Bag", category: "bags", price: 4800, colours: ["Tan", "Black"], description: "Compact crossbody bag." },
  { name: "Beanie", category: "accessories", price: 2400, colours: ["Forest", "Oat", "Black"], description: "Ribbed merino beanie." },
  { name: "Baseball Cap", category: "accessories", price: 2800, colours: ["Navy", "Sand"], description: "Six-panel washed cotton cap." },
  { name: "Wool Scarf", category: "accessories", price: 4400, colours: ["Grey", "Camel"], description: "Lambswool scarf." },
  { name: "Leather Belt", category: "accessories", price: 4800, sizes: ["S", "M", "L"], colours: ["Brown", "Black"], description: "Full-grain leather belt." },
  { name: "Crew Socks 3-Pack", category: "accessories", price: 1800, sizes: ["S/M", "L/XL"], description: "Cushioned cotton crew socks." },
  { name: "Leather Wallet", category: "accessories", price: 5400, colours: ["Brown", "Black"], description: "Slim bifold wallet." },
  { name: "Sunglasses", category: "accessories", price: 7800, compareAt: 9800, colours: ["Tortoise", "Black"], description: "Polarised acetate sunglasses." },
  { name: "Canvas Sneakers", category: "accessories", price: 6800, sizes: ["7", "8", "9", "10", "11", "12"], colours: ["White", "Black"], description: "Vulcanised canvas sneakers." },
  { name: "Wool Gloves", category: "accessories", price: 3400, sizes: ["S/M", "L/XL"], colours: ["Charcoal"], description: "Knit wool gloves with touchscreen tips." },
];

export const FIRST_NAMES = ["Alex", "Sam", "Jordan", "Taylor", "Casey", "Riley", "Morgan", "Jamie", "Avery", "Quinn",
  "Rowan", "Skyler", "Drew", "Reese", "Emerson", "Hayden", "Parker", "Sage", "Blake", "Cameron", "Dakota", "Elliot",
  "Finley", "Harper", "Kendall"];
export const LAST_NAMES = ["Rivera", "Patel", "Lee", "Kim", "Nguyen", "Garcia", "Smith", "Okafor", "Silva", "Cohen",
  "Novak", "Haddad", "Tanaka", "Moreau", "Larsen"];

export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
