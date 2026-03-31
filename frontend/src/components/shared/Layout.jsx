import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import useAuthStore from '../../store/authStore';
import styles from './Layout.module.css';

const NAV_ITEMS = [
  { path: '/',               label: 'Dashboard',       icon: '◈', module: 'dashboard'  },
  { path: '/planning',       label: 'Planning Board',  icon: '⊞', module: 'planning'   },
  { path: '/user-master',    label: 'User Master',     icon: '◎', module: 'usermaster' },
  { path: '/machine-types',  label: 'Machine Types',   icon: '⬡', module: 'machines'   },
  { path: '/user-management',label: 'User Management', icon: '⊕', module: 'usermgmt'   },
  { path: '/production-lines',label: 'Production Lines',icon: '⚙', module: 'admin'     },
  { path: '/operator-transfers',label: 'Operator Transfers',icon: '↔', module: 'admin' },
];

const ROLE_COLORS = {
  admin: 'av-admin', engineer: 'av-engineer',
  technician: 'av-technician', operator: 'av-operator',
};

function initials(name) {
  return name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??';
}

export default function Layout() {
  const { user, logout, canAccess } = useAuthStore();
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleChangePassword = () => {
    navigate('/change-password');
    setUserMenuOpen(false);
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div className={styles.brand}>
            <span className={styles.brandIcon}>🍃</span>
            <div>
              <div className={styles.brandName}>DILMAH</div>
              <div className={styles.brandSub}>Scheduling & Management</div>
            </div>
          </div>

          <nav className={styles.nav}>
            {NAV_ITEMS.map(item => {
              if (!canAccess(item.module)) return null;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  className={({ isActive }) =>
                    `${styles.navItem} ${isActive ? styles.navActive : ''}`
                  }
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className={styles.sidebarBottom}>
          <button 
            className={styles.userCardBtn}
            onClick={() => setUserMenuOpen(!userMenuOpen)}
          >
            <div className={`avatar avatar-sm ${ROLE_COLORS[user?.role]}`}>
              {initials(user?.name)}
            </div>
            <div className={styles.userInfo}>
              <div className={styles.userName}>{user?.name}</div>
              <div className={styles.userRole}>
                <span className={`badge badge-${user?.role}`}>{user?.role}</span>
                {user?.dedicatedLine && <span className={styles.userLine}>{user.dedicatedLine}</span>}
              </div>
            </div>
          </button>

          {userMenuOpen && (
            <div className={styles.userMenu}>
              <button
                className={styles.userMenuItem}
                onClick={handleChangePassword}
              >
                🔐 Change Password
              </button>
              <button
                className={styles.userMenuItem}
                onClick={handleLogout}
              >
                ← Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className={styles.main}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
