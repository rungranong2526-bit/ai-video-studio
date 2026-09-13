import {GoogleGenAI} from "@google/genai";
import {saveJSON} from "./_store.mjs";
export default async(req)=>{
 try{
  if(!process.env.GEMINI_API_KEY)return Response.json({error:"ตั้ง GEMINI_API_KEY ใน Netlify ก่อน"},{status:500});
  const d=await req.json(); const count=Math.min(Math.max(+d.count||3,1),3);
  const ai=new GoogleGenAI({apiKey:process.env.GEMINI_API_KEY});
  const prompt=`วางแผนโฆษณาสินค้าภาษาไทย ${d.product}. ลิงก์: ${d.link||"ไม่มี"}. มุมขาย: ${d.angle}. สร้าง ${count} คลิปที่มุมต่างกัน แต่ละคลิปประมาณ 8 วินาที. ตอบ JSON array เท่านั้น แต่ละรายการมี title,hook,voiceover,visual_prompt. ห้ามกล่าวอ้างเกินข้อมูลสินค้า.`;
  const r=await ai.models.generateContent({model:"gemini-2.5-flash",contents:prompt,config:{responseMimeType:"application/json"}});
  const plans=JSON.parse(r.text); const project_id=crypto.randomUUID();
  const jobs=[];
  for(const p of plans.slice(0,count)){const job_id=crypto.randomUUID();jobs.push({job_id,title:p.title,hook:p.hook,voiceover:p.voiceover,visual_prompt:p.visual_prompt,status:"queued",progress:0,message:"รอสร้างวิดีโอ",references:d.references||[]});await saveJSON(`job/${job_id}`,jobs.at(-1));}
  await saveJSON(`project/${project_id}`,{project_id,product:d.product,link:d.link,references:d.references||[],jobs:jobs.map(x=>x.job_id),created_at:Date.now()});
  // trigger each video job through internal fetch; functions remain stateless and job data lives in Blobs
  const base=new URL(req.url).origin;
  for(const j of jobs) fetch(base+"/api/start-video",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({job_id:j.job_id})}).catch(()=>{});
  return Response.json({project_id,jobs});
 }catch(e){return Response.json({error:e.message},{status:500})}
};
export const config={path:"/api/create-project"};