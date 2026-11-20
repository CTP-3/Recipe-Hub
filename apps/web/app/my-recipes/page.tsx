'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import RecipeCreator from '../../components/RecipeCreator';
import RecipeCard from '../../components/RecipeCard';
import { demoRecipes } from '../../lib/demo-recipes';
import { readSaved } from '../../lib/saved-recipes';
export default function MyRecipesPage() {
 const [tab,setTab]=useState<'saved'|'created'|'create'>('saved'); const [ids,setIds]=useState<string[]>([]);
 useEffect(()=>{if(new URLSearchParams(window.location.search).get('tab')==='create')setTab('create')},[]);
 useEffect(()=>{const sync=()=>setIds(readSaved());sync();window.addEventListener('recipe-hub:saved-changed',sync);return()=>window.removeEventListener('recipe-hub:saved-changed',sync)},[]);
 const recipes=demoRecipes.filter(r=>ids.includes(r.id));
 return <main className="mx-auto max-w-7xl px-5 py-10 md:px-8"><p className="text-sm font-bold uppercase tracking-widest text-[#a86d47]">Your collection</p><h1 className="mt-2 text-4xl font-black text-[#294d38]">My Recipes</h1><p className="mt-3 text-stone-600">A home for the meals you love and create.</p>
 <div className="my-8 flex flex-wrap gap-2 border-b border-stone-200 pb-4">{(['saved','created','create'] as const).map(t=><button key={t} onClick={()=>setTab(t)} aria-pressed={tab===t} className={`rounded-full px-6 py-3 font-semibold capitalize ${tab===t?'bg-[#294d38] text-white':'bg-white text-stone-600'}`}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>)}</div>
 {tab==='saved'?(recipes.length?<div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{recipes.map(r=><RecipeCard key={r.id} recipe={r}/>)}</div>:<div className="rounded-3xl bg-white p-12 text-center"><div className="text-5xl">♡</div><h2 className="mt-4 text-2xl font-bold text-[#294d38]">No saved recipes yet</h2><p className="mt-2 text-stone-600">Tap the heart on a recipe to keep it here.</p><Link href="/home#discover-recipes" className="mt-5 inline-block rounded-full bg-[#294d38] px-6 py-3 font-semibold text-white">Explore recipes</Link></div>):tab==='created'?<div className="rounded-3xl bg-white p-12 text-center"><div className="text-5xl">✦</div><h2 className="mt-4 text-2xl font-bold text-[#294d38]">Your creations will live here</h2><p className="mt-2 text-stone-600">Generated recipes aren't saved to an account yet. We'll connect this to the database later.</p><button onClick={()=>setTab('create')} className="mt-5 rounded-full bg-[#294d38] px-6 py-3 font-semibold text-white">Create a recipe</button></div>:<RecipeCreator/>}
 </main>;
}
