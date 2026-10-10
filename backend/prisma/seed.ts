/* Seeds the catalogue, staff roles and the first super admin. Safe to run repeatedly.
   Run with  npm run seed            (catalogue + roles + admin)
             npm run seed -- --demo  (also adds demo workers around Noida for local testing) */
import { BookingType as B, DocType as D, PricingModel as P, PrismaClient } from '@prisma/client';
import { existsSync } from 'fs';

if (existsSync('.env') && !process.env.DATABASE_URL) process.loadEnvFile('.env');
const prisma = new PrismaClient();

type Svc = { name: string; nameHi?: string; slug: string; types: B[]; models: P[]; docs?: D[]; history?: boolean; duration?: number };
type Sub = { name: string; nameHi?: string; slug: string; services: Svc[] };
type Cat = { name: string; nameHi?: string; slug: string; subs: Sub[] };

const ID: D[] = ['AADHAAR', 'ADDRESS_PROOF'];

const CATALOG: Cat[] = [
  {
    name: 'Home repair', nameHi: 'घर की मरम्मत', slug: 'home-repair', subs: [
      { name: 'Plumber', nameHi: 'प्लंबर', slug: 'plumber', services: [
        { name: 'Tap / leak repair', nameHi: 'नल / लीकेज मरम्मत', slug: 'tap-leak-repair', types: ['INSTANT', 'SCHEDULED'], models: ['PER_VISIT', 'PER_HOUR', 'CUSTOM_QUOTE'], docs: ID },
        { name: 'Bathroom fitting', slug: 'bathroom-fitting', types: ['SCHEDULED', 'QUOTE'], models: ['PER_HOUR', 'PER_JOB', 'CUSTOM_QUOTE'], docs: ID, duration: 180 },
        { name: 'Full pipeline work', slug: 'pipeline-work', types: ['QUOTE'], models: ['CUSTOM_QUOTE'], docs: ID, duration: 480 },
        { name: 'Emergency visit', slug: 'plumber-emergency', types: ['INSTANT'], models: ['PER_VISIT'], docs: ID },
      ] },
      { name: 'Electrician', nameHi: 'इलेक्ट्रीशियन', slug: 'electrician', services: [
        { name: 'Switch / socket repair', slug: 'switch-socket-repair', types: ['INSTANT', 'SCHEDULED'], models: ['PER_VISIT', 'PER_JOB'], docs: ID },
        { name: 'Fan / light installation', slug: 'fan-light-installation', types: ['INSTANT', 'SCHEDULED'], models: ['PER_ITEM', 'PER_VISIT'], docs: ID },
        { name: 'House wiring', slug: 'house-wiring', types: ['QUOTE'], models: ['CUSTOM_QUOTE'], docs: ID, duration: 480 },
      ] },
      { name: 'Carpenter', nameHi: 'बढ़ई', slug: 'carpenter', services: [
        { name: 'Furniture repair', slug: 'furniture-repair', types: ['INSTANT', 'SCHEDULED', 'QUOTE'], models: ['PER_VISIT', 'PER_HOUR', 'CUSTOM_QUOTE'], docs: ID },
      ] },
    ],
  },
  {
    name: 'Driving & transport', nameHi: 'ड्राइविंग', slug: 'driving', subs: [
      { name: 'Driver', nameHi: 'ड्राइवर', slug: 'driver', services: [
        { name: 'Hourly / daily driver', slug: 'driver-hourly', types: ['INSTANT', 'SCHEDULED'], models: ['PER_HOUR', 'PER_DAY', 'PACKAGE'], docs: [...ID, 'DRIVING_LICENCE'], duration: 480 },
        { name: 'Outstation driver', slug: 'driver-outstation', types: ['SCHEDULED', 'QUOTE'], models: ['PER_DAY', 'PER_KM', 'CUSTOM_QUOTE'], docs: [...ID, 'DRIVING_LICENCE'], duration: 1440 },
      ] },
    ],
  },
  {
    name: 'Home help', nameHi: 'घरेलू मदद', slug: 'home-help', subs: [
      { name: 'Maid', nameHi: 'मेड', slug: 'maid', services: [
        { name: 'Daily cleaning', slug: 'daily-cleaning', types: ['INSTANT', 'SCHEDULED'], models: ['PER_DAY', 'PER_VISIT', 'PACKAGE'], docs: ID, duration: 120 },
        { name: 'Deep cleaning', slug: 'deep-cleaning', types: ['SCHEDULED', 'QUOTE'], models: ['PER_JOB', 'CUSTOM_QUOTE'], docs: ID, duration: 300 },
      ] },
    ],
  },
  {
    name: 'Construction & labour', nameHi: 'निर्माण और मज़दूरी', slug: 'construction', subs: [
      { name: 'Labour', nameHi: 'मज़दूर', slug: 'labour', services: [
        { name: 'Daily labour', nameHi: 'दिहाड़ी मज़दूर', slug: 'daily-labour', types: ['INSTANT', 'SCHEDULED'], models: ['PER_DAY', 'PER_PERSON'], docs: ID, duration: 480 },
      ] },
      { name: 'Painter', nameHi: 'पेंटर', slug: 'painter', services: [
        { name: 'Wall painting', slug: 'wall-painting', types: ['SCHEDULED', 'QUOTE'], models: ['PER_DAY', 'PER_JOB', 'CUSTOM_QUOTE'], docs: ID, duration: 480 },
      ] },
    ],
  },
  {
    name: 'Events & media', nameHi: 'इवेंट और मीडिया', slug: 'events', subs: [
      { name: 'DJ / Event', slug: 'dj', services: [
        { name: 'Party DJ', slug: 'party-dj', types: ['SCHEDULED', 'QUOTE'], models: ['PACKAGE', 'CUSTOM_QUOTE'], docs: ID, duration: 300 },
      ] },
      { name: 'Photographer', nameHi: 'फोटोग्राफर', slug: 'photographer', services: [
        { name: 'Event photography', slug: 'event-photography', types: ['SCHEDULED', 'QUOTE'], models: ['PACKAGE', 'PER_HOUR', 'CUSTOM_QUOTE'], docs: ID, duration: 300 },
      ] },
    ],
  },
  {
    name: 'Office staff', nameHi: 'ऑफिस स्टाफ', slug: 'office-staff', subs: [
      { name: 'Office staff / Employee', slug: 'office-employee', services: [
        { name: 'Office assistant', slug: 'office-assistant', types: ['SCHEDULED', 'QUOTE'], models: ['PER_DAY', 'PACKAGE', 'CUSTOM_QUOTE'], docs: [...ID, 'RESUME'], history: true, duration: 480 },
        { name: 'Receptionist / front desk', slug: 'receptionist', types: ['SCHEDULED', 'QUOTE'], models: ['PER_DAY', 'PACKAGE', 'CUSTOM_QUOTE'], docs: [...ID, 'RESUME'], history: true, duration: 480 },
      ] },
    ],
  },
  {
    name: 'Technicians', nameHi: 'टेक्नीशियन', slug: 'technicians', subs: [
      { name: 'Appliance technician', slug: 'appliance-technician', services: [
        { name: 'AC repair & service', slug: 'ac-repair', types: ['INSTANT', 'SCHEDULED'], models: ['PER_VISIT', 'PER_JOB'], docs: ID, duration: 90 },
        { name: 'RO / water purifier', slug: 'ro-service', types: ['INSTANT', 'SCHEDULED'], models: ['PER_VISIT', 'PER_JOB'], docs: ID },
      ] },
    ],
  },
];

const STAFF_ROLES: { name: string; permissions: string[] }[] = [
  { name: 'Verification manager', permissions: ['workers.view', 'workers.verify', 'documents.view', 'leads.view'] },
  { name: 'Worker manager', permissions: ['workers.view', 'workers.edit', 'clients.view', 'bookings.view', 'complaints.view', 'leads.view', 'subscriptions.edit'] },
  { name: 'Client manager', permissions: ['clients.view', 'clients.edit', 'bookings.view', 'complaints.view'] },
  { name: 'Booking manager', permissions: ['workers.view', 'clients.view', 'bookings.view', 'bookings.edit', 'complaints.view'] },
  { name: 'Payment manager', permissions: ['payments.view', 'payments.refund', 'clients.view', 'workers.view', 'subscriptions.edit'] },
  { name: 'Complaint manager', permissions: ['complaints.view', 'complaints.edit', 'workers.view', 'clients.view', 'clients.edit', 'bookings.view'] },
  { name: 'Lead manager', permissions: ['leads.view', 'leads.assign', 'leads.edit', 'workers.view'] },
  { name: 'Category manager', permissions: ['categories.edit', 'workers.view'] },
  { name: 'Support manager', permissions: ['clients.view', 'workers.view', 'bookings.view', 'complaints.view', 'complaints.edit', 'payments.view'] },
];

async function seedCatalog() {
  let order = 0;
  for (const c of CATALOG) {
    const cat = await prisma.category.upsert({ where: { slug: c.slug }, create: { name: c.name, nameHi: c.nameHi, slug: c.slug, sortOrder: order++ }, update: {} });
    let so = 0;
    for (const s of c.subs) {
      const sub = await prisma.subCategory.upsert({ where: { slug: s.slug }, create: { name: s.name, nameHi: s.nameHi, slug: s.slug, categoryId: cat.id, sortOrder: so++ }, update: {} });
      let vo = 0;
      for (const v of s.services) {
        await prisma.service.upsert({
          where: { slug: v.slug },
          create: {
            subCategoryId: sub.id, name: v.name, nameHi: v.nameHi, slug: v.slug, sortOrder: vo++,
            bookingTypes: v.types, pricingModels: v.models, requiredDocs: v.docs ?? [], needsWorkHistory: !!v.history,
            durationMin: v.duration ?? 60,
          },
          update: {},
        });
      }
    }
  }
}

async function seedStaff() {
  for (const r of STAFF_ROLES) await prisma.staffRole.upsert({ where: { name: r.name }, create: r, update: {} });
  const phone = (process.env.SEED_ADMIN_PHONE ?? '').replace(/\D/g, '').slice(-10);
  if (!/^[6-9]\d{9}$/.test(phone)) {
    console.log('SEED_ADMIN_PHONE not set to a valid mobile number; skipped creating the super admin');
    return;
  }
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    if (!existing.roles.includes('ADMIN')) await prisma.user.update({ where: { id: existing.id }, data: { roles: { push: 'ADMIN' } } });
  } else {
    await prisma.user.create({ data: { phone, name: 'Super Admin', roles: ['ADMIN'] } });
  }
  console.log(`Super admin: ${phone.slice(0, 2)}xxxxx${phone.slice(7)} (log in to the admin console with this number)`);
}

/** Demo workers around Sector 62, Noida with active trials so the full client flow can be tried locally. */
async function seedDemo() {
  const svc = async (slug: string) => (await prisma.service.findUniqueOrThrow({ where: { slug } })).id;
  const demo = [
    { phone: '9000000001', name: 'Rakesh Yadav', lat: 28.6280, lng: 77.3649, area: 'Sector 63, Noida', exp: 8, skills: ['CPVC & PVC fitting', 'Leak detection'], services: ['tap-leak-repair', 'bathroom-fitting', 'pipeline-work', 'plumber-emergency'], rates: [['Visit charge', 'PER_VISIT', 30000], ['First hour', 'PER_HOUR', 50000], ['Emergency visit', 'PER_VISIT', 70000]] },
    { phone: '9000000002', name: 'Mohan Singh', lat: 28.6158, lng: 77.3726, area: 'Sector 61, Noida', exp: 12, skills: ['Leak repair', 'Water tank'], services: ['tap-leak-repair', 'pipeline-work'], rates: [['Visit charge', 'PER_VISIT', 35000]] },
    { phone: '9000000003', name: 'Arjun Mehta', lat: 28.6220, lng: 77.3570, area: 'Sector 62, Noida', exp: 6, skills: ['Wiring', 'Fan installation'], services: ['switch-socket-repair', 'fan-light-installation', 'house-wiring'], rates: [['Visit charge', 'PER_VISIT', 25000], ['Per fan / light', 'PER_ITEM', 20000]] },
    { phone: '9000000004', name: 'Imran Khan', lat: 28.6400, lng: 77.3700, area: 'Indirapuram', exp: 10, skills: ['Highway driving', 'Automatic cars'], services: ['driver-hourly', 'driver-outstation'], rates: [['Hourly', 'PER_HOUR', 15000], ['Full day', 'PER_DAY', 120000], ['8 hours', 'PACKAGE', 100000]] },
    { phone: '9000000005', name: 'Sunita Devi', lat: 28.6050, lng: 77.3600, area: 'Sector 50, Noida', exp: 9, skills: ['Deep cleaning', 'Kitchen cleaning'], services: ['daily-cleaning', 'deep-cleaning'], rates: [['Per day', 'PER_DAY', 60000], ['Deep clean (2BHK)', 'PER_JOB', 250000]] },
  ] as const;
  for (const d of demo) {
    const user = await prisma.user.upsert({ where: { phone: d.phone }, create: { phone: d.phone, name: d.name, roles: ['WORKER'] }, update: {} });
    await prisma.workerProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id, lat: d.lat, lng: d.lng, area: d.area, pincode: '201301', experienceYears: d.exp, skills: [...d.skills], languages: ['Hindi'],
        availability: 'AVAILABLE', verificationStatus: 'VERIFIED', verifiedAt: new Date(), trialUsed: true, ratingAvg: 0, ratingCount: 0,
      },
      update: { availability: 'AVAILABLE', verificationStatus: 'VERIFIED' },
    });
    for (const slug of d.services) {
      const serviceId = await svc(slug);
      await prisma.workerService.upsert({ where: { workerId_serviceId: { workerId: user.id, serviceId } }, create: { workerId: user.id, serviceId }, update: {} });
    }
    await prisma.workerRate.deleteMany({ where: { workerId: user.id } });
    await prisma.workerRate.createMany({ data: d.rates.map(([label, model, amountPaise], i) => ({ workerId: user.id, label, model: model as P, amountPaise, sortOrder: i })) });
    const active = await prisma.subscription.count({ where: { userId: user.id, endsAt: { gt: new Date() } } });
    if (!active) await prisma.subscription.create({ data: { userId: user.id, kind: 'WORKER_TRIAL', source: 'TRIAL', startsAt: new Date(), endsAt: new Date(Date.now() + 30 * 86400000), note: 'Demo seed' } });
  }
  console.log(`Demo: ${demo.length} verified, available workers around Sector 62, Noida (phones 9000000001-5)`);
}

async function main() {
  await seedCatalog();
  await seedStaff();
  if (process.argv.includes('--demo')) await seedDemo();
  const counts = await Promise.all([prisma.category.count(), prisma.subCategory.count(), prisma.service.count(), prisma.staffRole.count()]);
  console.log(`Catalogue: ${counts[0]} categories, ${counts[1]} sub-categories, ${counts[2]} services · ${counts[3]} staff roles`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
