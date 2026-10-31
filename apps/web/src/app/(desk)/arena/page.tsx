'use client';

import { redirect } from 'next/navigation';

export default function ArenaPage() {
  redirect('/lab?library=all&progress=1');
}
