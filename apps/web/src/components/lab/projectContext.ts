// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Joseph Allan Kamara
import { createContext, useContext } from 'react';

/** Set by the dashboard's Projects section: the lab designer then runs as a blank personal workspace. */
export const LabProjectContext = createContext<string | undefined>(undefined);
export const useLabProject = () => useContext(LabProjectContext);
