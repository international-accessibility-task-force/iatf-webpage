import React from 'react'

import { Header, Main, Footer } from '../layout/_all'
import Nav from '../components/Nav'

const App = () => {
  return (
    <div className='App'>
      <a href='#main-content' className='skip-to-main-content-link'>
        Skip to main content
      </a>
      <Header />
      <Nav />
      <Main />
      <Footer />
    </div>
  )
}

export default App
