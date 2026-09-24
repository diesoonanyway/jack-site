import type { APIRoute } from 'astro';

import { createStorySearchResponse } from '../../lib/story-search';

export const GET: APIRoute = () => createStorySearchResponse('en');
