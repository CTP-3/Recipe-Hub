'use client';
import {useEffect,useState} from 'react';
import {readSaved,writeSaved} from '../lib/saved-recipes';
export default function SaveRecipeButton({id}:{id:string}) {
 const [saved,setSaved]=useState(false);
 useEffect(()=>setSaved(readSaved().includes(id)),[id]);
 return <button onClick={()=>{const ids=readSaved();writeSaved(saved?ids.filter(x=>x!==id):[...ids,id]);setSaved(!saved)}} className="rounded-full bg-[#294d38] px-6 py-3 font-semibold text-white">{saved?'♥ Saved recipe':'♡ Save recipe'}</button>;
}
