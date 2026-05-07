import { PrismaClient, CountryCode, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? 'admin@nibebee.local';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe!Admin123';
  const hash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: hash,
      role: UserRole.Admin,
      country: CountryCode.KE,
      phoneE164: '+254700000000',
      firstName: 'Nibebee',
      lastName: 'Admin',
    },
    create: {
      email: adminEmail,
      passwordHash: hash,
      role: UserRole.Admin,
      country: CountryCode.KE,
      phoneE164: '+254700000000',
      firstName: 'Nibebee',
      lastName: 'Admin',
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded admin user: ${adminEmail}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
