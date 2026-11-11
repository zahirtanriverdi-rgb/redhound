// HTTP client calls look like routes but are not handlers.
import axios from 'axios';

export async function saveDraft(draft: unknown) {
  await axios.post('/api/drafts', draft);
  await api.delete(`/api/drafts/${1}`, { headers: { 'x-trace': '1' } });
}
