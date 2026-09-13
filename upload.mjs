import {getStore} from "@netlify/blobs";
export default async(req)=>{
 if(req.method!=="POST")return Response.json({error:"POST only"},{status:405});
 const form=await req.formData(); const file=form.get("file");
 if(!file)return Response.json({error:"ไม่มีไฟล์"}, {status:400});
 if(file.size>8_000_000)return Response.json({error:"ไฟล์ใหญ่เกิน 8MB"}, {status:413});
 const id=crypto.randomUUID()+"-"+file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
 const s=getStore("ai-video-studio"); await s.set(id,await file.arrayBuffer(),{metadata:{contentType:file.type}});
 return Response.json({id});
};
export const config={path:"/api/upload"};