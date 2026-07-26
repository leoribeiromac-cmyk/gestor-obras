// GESTOR OBRAS — MÓDULO DE AUTENTICAÇÃO E PERFIS (RBAC)

(function () {
  const SESSION_KEY = 'gestor_session_v2';
  const LOCKOUT_KEY = 'gestor_lockout_v2';

  const Auth = {
    // Retorna a sessão ativa armazenada
    getSession() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (session.expiresAt && Date.now() > session.expiresAt) {
          this.logout();
          return null;
        }
        return session;
      } catch (e) {
        return null;
      }
    },

    // Salva a sessão após login com sucesso
    setSession(data) {
      const session = {
        usuario: data.usuario || 'Usuário',
        perfil: data.perfil || 'engenheiro',
        token: data.token || '',
        loginAt: Date.now(),
        expiresAt: Date.now() + ((data.expiraEmSegundos || 21600) * 1000)
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return session;
    },

    // Encerra a sessão
    logout() {
      localStorage.removeItem(SESSION_KEY);
      window.dispatchEvent(new CustomEvent('gestor:authChanged', { detail: null }));
    },

    // Verifica se o usuário tem a role necessária
    hasRole(requiredRoles) {
      const sess = this.getSession();
      if (!sess) return false;
      if (sess.perfil === 'admin') return true; // Admin sempre tem acesso completo
      if (Array.isArray(requiredRoles)) return requiredRoles.includes(sess.perfil);
      return sess.perfil === requiredRoles;
    },

    // Retorna token de sessão para requisições
    getToken() {
      const sess = this.getSession();
      return sess ? sess.token : '';
    },

    // Registra tentativa falha e checa lockout local
    checkLockout() {
      try {
        const raw = localStorage.getItem(LOCKOUT_KEY);
        if (!raw) return { locked: false, attempts: 0 };
        const data = JSON.parse(raw);
        if (data.lockedUntil && Date.now() < data.lockedUntil) {
          const restMin = Math.ceil((data.lockedUntil - Date.now()) / 60000);
          return { locked: true, restMin };
        }
        if (data.lockedUntil && Date.now() >= data.lockedUntil) {
          localStorage.removeItem(LOCKOUT_KEY);
          return { locked: false, attempts: 0 };
        }
        return { locked: false, attempts: data.attempts || 0 };
      } catch (e) {
        return { locked: false, attempts: 0 };
      }
    },

    registerFailedAttempt() {
      const current = this.checkLockout();
      const attempts = (current.attempts || 0) + 1;
      if (attempts >= 5) {
        const lockedUntil = Date.now() + (15 * 60 * 1000); // 15 minutos
        localStorage.setItem(LOCKOUT_KEY, JSON.stringify({ attempts, lockedUntil }));
        return { locked: true, restMin: 15 };
      }
      localStorage.setItem(LOCKOUT_KEY, JSON.stringify({ attempts, lockedUntil: null }));
      return { locked: false, attempts };
    },

    clearLockout() {
      localStorage.removeItem(LOCKOUT_KEY);
    }
  };

  window.GestorAuth = Auth;
})();
