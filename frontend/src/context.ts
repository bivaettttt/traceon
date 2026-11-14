import { useOutletContext } from "react-router-dom";
import type { Row, User } from "./api";
export type Context = { user: User; project?: Row; path: string };
export const useContext = () => useOutletContext<Context>();
