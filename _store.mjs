import { getStore } from "@netlify/blobs";
export function store(){ return getStore("ai-video-studio"); }
export async function saveJSON(key,obj){await store().setJSON(key,obj)}
export async function loadJSON(key){return await store().get(key,{type:"json"})}
