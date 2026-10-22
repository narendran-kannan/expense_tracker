// Stand-in for next/cache when running a server action outside a Next request.
export function revalidatePath() {}
export function revalidateTag() {}
export function unstable_cache(fn) {
  return fn;
}
