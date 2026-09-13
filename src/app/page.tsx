import { redirect } from 'next/navigation';

/**
 * Root page redirects to the primary demo brand.
 */
export default function RootPage() {
  redirect('/tmperfumehouse');
}
