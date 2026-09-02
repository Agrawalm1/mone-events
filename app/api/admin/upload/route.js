import { put } from '@vercel/blob';
import { isAdmin, unauthorized } from '@/lib/auth';

export async function POST(request) {
  if (!(await isAdmin())) return unauthorized();

  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return Response.json({ error: 'No file received.' }, { status: 400 });
  }
  if (file.size > 4_000_000) {
    return Response.json({ error: 'Image is over 4 MB after resizing. Try a smaller one.' }, { status: 413 });
  }

  const blob = await put(`event-${Date.now()}.jpg`, file, {
    access: 'public',
    contentType: 'image/jpeg',
  });
  return Response.json({ url: blob.url });
}
