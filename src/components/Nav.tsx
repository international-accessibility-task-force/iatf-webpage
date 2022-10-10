import { NavLink } from 'react-router-dom'

export default function Navbar() {
  return (
    <nav>
      <ul>
        <li>
          <NavLink to='/'>Manifest</NavLink>
        </li>
        <li>
          <NavLink to='/users'>Users</NavLink>
        </li>
        <li>
          <NavLink to='/developers'>Developers</NavLink>
        </li>
        <li>
          <NavLink to='/join-us'>Join us!</NavLink>
        </li>
      </ul>
    </nav>
  )
}
