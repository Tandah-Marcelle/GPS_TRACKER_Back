const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main(){
  const updates = [
    { username: 'manager', email: 'manager@camtrack.local' },
    { username: 'tech1', email: 'tech1@camtrack.local' },
    { username: 'tech2', email: 'tech2@camtrack.local' },
  ];
  for(const u of updates){
    const user = await p.user.findUnique({where:{username:u.username}});
    if(user){
      await p.user.update({where:{id:user.id}, data:{email:u.email, isVerified:true, otp:null, otpExpiresAt:null}});
      console.log(`updated ${u.username} -> ${u.email} verified`);
    } else {
      console.log(`not found ${u.username}`);
    }
  }
  const all = await p.user.findMany({select:{username:true,email:true,isVerified:true,role:true}});
  console.log(all);
}
main().catch(e=>console.error(e)).finally(()=>p.$disconnect());
