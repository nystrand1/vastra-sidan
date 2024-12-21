import { prisma } from "~/server/db"

export const getMemberCount = async () => {
  const members = await prisma.member.findMany({    
    where: {
      memberships: {
        some: {
          endDate: {
            gte: new Date()
          },  
          startDate: {
            lte: new Date()
          }        
        },       
      },
    },
    include: {
      memberships: true,
    }
  })
  if (!members) {
    return 0
  }

  return members.length
}