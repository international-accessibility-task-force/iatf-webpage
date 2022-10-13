import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import ErrorPage from './routes/error'
import Root from './routes/root'
import { Users, Developers, Join, Manifest } from './pages/_all'

import './scss/global.scss'

// TODO: extract this logic outside of index.tsx
const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    errorElement: <ErrorPage />,
    children: [
      {
        path: '/', // expert review wanted
        element: <Manifest />,
      },
      {
        path: '/users',
        element: <Users />,
      },
      {
        path: '/developers',
        element: <Developers />,
      },
      {
        path: '/join-us',
        element: <Join />,
      },
    ],
  },
])

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)
root.render(
  <React.StrictMode>
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>
  </React.StrictMode>
)
