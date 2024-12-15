import { prisma } from "~/server/db"

export const getMemberCount = async () => {
  const members = await prisma.member.findMany({    
    select: {
      _count: true,
    },
    where: {
      memberships: {
        some: {
          endDate: {
            gte: new Date()
          },          
        },       
      },
    }
  })

  if (!members) {
    return 0
  }

  return members.length
}