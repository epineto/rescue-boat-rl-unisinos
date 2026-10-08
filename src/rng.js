// PRNG com semente (mulberry32): reprodutível e rápido. / Seeded PRNG (mulberry32): reproducible and fast.
export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const randint = (n) => Math.floor(random() * n);
  return { random, randint };
}
