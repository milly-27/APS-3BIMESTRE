import { createContext, useContext, useEffect, useState } from 'react'
import { z } from 'zod'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase.js'

// eslint-disable-next-line react-refresh/only-export-components
export const loginSchema = z.object({
  email: z.string().trim().email('Informe um e-mail válido.'),
  password: z.string().min(1, 'Informe sua senha.'),
})

// eslint-disable-next-line react-refresh/only-export-components
export const signUpSchema = z.object({
  displayName: z.string()
    .trim()
    .min(1, 'Informe seu nome para o ranking.')
    .max(32, 'O nome deve ter no máximo 32 caracteres.'),
  email: z.string().trim().email('Informe um e-mail válido.'),
  password: z.string()
    .min(8, 'A senha deve ter pelo menos 8 caracteres.')
    .max(72, 'A senha deve ter no máximo 72 caracteres.'),
  confirmPassword: z.string().min(1, 'Confirme sua senha.'),
}).refine((values) => values.password === values.confirmPassword, {
  path: ['confirmPassword'],
  message: 'As senhas não coincidem.',
})

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured)
  const [authError, setAuthError] = useState(
    isSupabaseConfigured ? '' : 'Supabase não configurado. Preencha o arquivo .env local.',
  )
  const [pendingScore, setPendingScore] = useState(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return undefined
    }

    const client = getSupabaseClient()
    let active = true

    client.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          throw error
        }

        if (active) {
          setSession(data.session)
          setAuthError('')
        }
      })
      .catch((error) => {
        if (active) {
          setAuthError(`Não foi possível verificar a sessão: ${error.message}`)
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession)
        setAuthError('')
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  async function signIn({ email, password }) {
    setAuthError('')
    const { data, error } = await getSupabaseClient().auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      throw new Error(`Não foi possível entrar: ${error.message}`, { cause: error })
    }

    setSession(data.session)
    return data
  }

  async function requestSignUpCode({ email }) {
    setAuthError('')
    const { error } = await getSupabaseClient().auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
      },
    })

    if (error) {
      throw new Error(`Não foi possível enviar o código: ${error.message}`, { cause: error })
    }
  }

  async function verifySignUpCode({ email, token }) {
    setAuthError('')
    const { data, error } = await getSupabaseClient().auth.verifyOtp({
      email,
      token,
      type: 'email',
    })

    if (error) {
      throw new Error(`Não foi possível validar o código: ${error.message}`, { cause: error })
    }

    if (data.session) {
      setSession(data.session)
    }

    return data
  }

  async function completeSignUp({ displayName, password }) {
    setAuthError('')
    const client = getSupabaseClient()
    const { error: profileError } = await client.auth.updateUser({
      data: { display_name: displayName.trim() },
    })

    if (profileError) {
      throw new Error(`Não foi possível salvar o nome: ${profileError.message}`, { cause: profileError })
    }

    const { error: passwordError } = await client.auth.updateUser({
      password,
    })

    if (passwordError) {
      throw new Error(`Não foi possível salvar a senha: ${passwordError.message}`, { cause: passwordError })
    }
  }

  async function signUp({ displayName, email, password }) {
    setAuthError('')
    const { data, error } = await getSupabaseClient().auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName.trim() },
      },
    })

    if (error) {
      throw new Error(`Não foi possível criar a conta: ${error.message}`, { cause: error })
    }

    if (data.session) {
      setSession(data.session)
    }

    return data
  }

  async function signOut() {
    setAuthError('')
    const { error } = await getSupabaseClient().auth.signOut()

    if (error) {
      throw new Error(`Não foi possível sair da conta: ${error.message}`, { cause: error })
    }

    setSession(null)
  }

  const value = {
    authError,
    isLoading,
    pendingScore,
    session,
    setPendingScore,
    completeSignUp,
    requestSignUpCode,
    signIn,
    signOut,
    signUp,
    verifySignUpCode,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider.')
  }

  return context
}
