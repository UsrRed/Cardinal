import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell.js';
import { Masthead } from './components/Masthead.js';
import { Empty } from './components/States.js';
import { FeedsPage } from './pages/FeedsPage.js';
import { RunPage } from './pages/RunPage.js';
import { RunsPage } from './pages/RunsPage.js';
import { DigestPage } from './pages/DigestPage.js';
import { FeedDetailPage } from './pages/FeedDetailPage.js';
import { StreamPage } from './pages/StreamPage.js';
import { FeedFormPage } from './pages/FeedFormPage.js';

function Placeholder({ title }: { title: string }) {
  return (
    <>
      <Masthead title={title} />
      <Empty title="Bientôt disponible" />
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<FeedsPage />} />
          <Route path="/feeds/new" element={<FeedFormPage />} />
          <Route path="/feeds/:id/edit" element={<FeedFormPage />} />
          <Route path="/feeds/:id" element={<FeedDetailPage />} />
          <Route path="/stream" element={<StreamPage />} />
          <Route path="/digests/:id" element={<DigestPage />} />
          <Route path="/runs" element={<RunsPage />} />
          <Route path="/runs/:id" element={<RunPage />} />
          <Route path="*" element={<Placeholder title="Personnal Flux" />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
