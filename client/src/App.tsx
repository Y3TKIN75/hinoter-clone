import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import Layout from './components/Layout';
import NotesListPage from './pages/NotesListPage';
import RecordPage from './pages/RecordPage';
import UploadPage from './pages/UploadPage';
import NoteDetailPage from './pages/NoteDetailPage';

// Data router: RecordPage'in kayıt sırasında uygulama içi geçişleri engelleyebilmesi (useBlocker) için gerekli.
const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <NotesListPage /> },
      { path: 'record', element: <RecordPage /> },
      { path: 'upload', element: <UploadPage /> },
      { path: 'notes/:id', element: <NoteDetailPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
