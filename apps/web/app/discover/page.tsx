'use client';
import { useMemo, useState } from 'react';
import RecipeCard from '../../components/RecipeCard';
import { demoRecipes } from '../../lib/demo-recipes';
const categories = ['All','Breakfast','Lunch','Dinner','Dessert'];
export default function DiscoverPage() {
 const [search,setSearch]=useState(''); const [category,setCategory]=useState('All');
 const recipes=useMemo(()=>demoRecipes.filter(r=>(category==='All'||r.category===category) && `${r.title} ${r.description} ${r.ingredients.join(' ')}`.toLowerCase().includes(search.toLowerCase())),[search,category]);
 return <main className="mx-auto max-w-7xl px-5 py-10 md:px-8"><div className="mb-8"><p className="text-sm font-bold uppercase tracking-widest text-[#a86d47]">Find your next favorite</p><h1 className="mt-2 text-4xl font-black text-[#294d38] md:text-5xl">Discover recipes</h1><p className="mt-3 text-stone-600">Browse, get inspired, and save what looks good.</p></div>
 <label htmlFor="recipe-search" className="sr-only">Search recipes</label><input id="recipe-search" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search recipes or ingredients..." className="mb-5 w-full rounded-2xl border border-stone-300 bg-white px-5 py-4 outline-none focus:border-[#294d38]"/>
 <div className="mb-8 flex flex-wrap gap-2">{categories.map(c=><button key={c} onClick={()=>setCategory(c)} aria-pressed={category===c} className={`rounded-full px-5 py-2 text-sm font-semibold ${category===c?'bg-[#294d38] text-white':'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100'}`}>{c}</button>)}</div>
 {recipes.length?<div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{recipes.map(r=><RecipeCard key={r.id} recipe={r}/>)}</div>:<p className="rounded-2xl bg-white p-8 text-center text-stone-500">No recipes found. Try another search.</p>}
 </main>;
}