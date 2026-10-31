import { createContext, useContext } from 'react';

/** Set by the dashboard's Projects section: the lab designer then runs as a blank personal workspace. */
export const LabProjectContext = createContext<string | undefined>(undefined);
export const useLabProject = () => useContext(LabProjectContext);
