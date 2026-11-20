export type Recipe = {
  id: string;
  title: string;
  description: string;
  image: string;
  category: string;
  time: string;
  servings: number;
  ingredients: string[];
  instructions: string[];
  source?: string;
};

export const demoRecipes: Recipe[] = [
  {id:'cajun-salmon',title:'Cajun Salmon',description:'A flavorful salmon dinner with a smoky kick.',image:'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=900&q=80',category:'Dinner',time:'35 min',servings:4,ingredients:['4 salmon fillets','2 tbsp olive oil','1 tsp paprika','1 tsp garlic powder','Lemon juice','Salt and pepper'],instructions:['Preheat the oven to 400°F.','Pat salmon dry and season with paprika, garlic powder, salt, and pepper.','Drizzle with olive oil and lemon juice.','Bake until cooked through, checking doneness before serving.']},
  {id:'tomato-pasta',title:'Creamy Tomato Pasta',description:'Cozy pasta with a rich tomato sauce.',image:'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=900&q=80',category:'Dinner',time:'25 min',servings:2,ingredients:['8 oz pasta','1 cup tomato sauce','2 cloves garlic','1 tbsp olive oil','Fresh basil'],instructions:['Boil pasta until al dente.','Sauté garlic in olive oil.','Add tomato sauce and simmer.','Toss pasta with sauce and finish with basil.']},
  {id:'berry-pancakes',title:'Berry Pancakes',description:'Fluffy pancakes topped with fresh berries.',image:'https://images.unsplash.com/photo-1528207776546-365bb710ee93?w=900&q=80',category:'Breakfast',time:'20 min',servings:3,ingredients:['1 cup flour','1 cup milk of choice','2 tsp baking powder','1 tbsp sugar','Fresh berries'],instructions:['Combine dry ingredients.','Whisk in milk to make a batter.','Cook small pancakes on a lightly oiled pan.','Top with berries and serve.']},
  {id:'grain-bowl',title:'Rainbow Grain Bowl',description:'Fresh vegetables over hearty grains.',image:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=900&q=80',category:'Lunch',time:'30 min',servings:2,ingredients:['2 cups cooked quinoa','1 cucumber','1 carrot','1 cup cherry tomatoes','Olive oil and lemon'],instructions:['Cook quinoa and cool slightly.','Chop vegetables.','Arrange over quinoa.','Dress with olive oil and lemon.']},
  {id:'chocolate-cake',title:'Chocolate Cake',description:'A rich treat for dessert lovers.',image:'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=900&q=80',category:'Dessert',time:'55 min',servings:8,ingredients:['1 cup flour','1/2 cup cocoa powder','3/4 cup sugar','1 tsp baking powder','3/4 cup milk of choice'],instructions:['Preheat oven to 350°F.','Mix dry ingredients.','Add milk and stir until combined.','Bake in a greased pan until a toothpick comes out clean.']},
  {id:'avocado-toast',title:'Garden Toast',description:'A crisp toast with bright, fresh toppings.',image:'https://images.unsplash.com/photo-1547592180-85f173990554?w=900&q=80',category:'Breakfast',time:'10 min',servings:1,ingredients:['2 slices bread','1 tomato','Handful of greens','Olive oil','Salt and pepper'],instructions:['Toast bread.','Slice tomato.','Layer greens and tomato on toast.','Season and drizzle with olive oil.']}
];
