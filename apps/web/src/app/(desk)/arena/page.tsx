// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Joseph Allan Kamara
'use client';

import { redirect } from 'next/navigation';

export default function ArenaPage() {
  redirect('/lab?library=all&progress=1');
}
