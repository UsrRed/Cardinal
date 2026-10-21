import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell.js';
import { Masthead } from './components/Masthead.js';
import { Empty } from './components/States.js';

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
          <Route path="/" element={<Placeholder title="Flux de veille" />} />
          <Route path="*" element={<Placeholder title="Personnal Flux" />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
