// import { PrismaClient } from "@prisma/client";
// import { withAccelerate } from '@prisma/extension-accelerate'

// export const prisma = new PrismaClient().$extends(withAccelerate())


// import { PrismaClient } from "@prisma/client";

// export { VideoStatus } from "@prisma/client";

// const createPrismaClient = () => new PrismaClient();

// type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

// const globalForPrisma = globalThis as {
//   prisma?: ExtendedPrismaClient;
// };

// export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// if (process.env.NODE_ENV !== "production") {
//   globalForPrisma.prisma = prisma;
// }

//new 

import {PrismaClient} from "@prisma/client";

export {VideoStatus} from "@prisma/client";

const createPrismaClient = ()=> new PrismaClient();

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;
 
const globalForPrisma = globalThis as {
  prisma?: ExtendedPrismaClient;
};
 
export const prisma = globalForPrisma.prisma ?? createPrismaClient();
 
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
 