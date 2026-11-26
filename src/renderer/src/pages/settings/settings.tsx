import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Languages } from '@/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import apis from '../api/api'
import { toast } from 'sonner'
import { Input } from '@renderer/components/ui/input'
import { useEffect, useState } from 'react'
import i18n from '@renderer/i18n/config'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Separator } from '@renderer/components/ui/separator'

export default function Settings(): React.JSX.Element {
  const { t } = useTranslation()
  const navigate = useNavigate()


  return (
    <>
      <section className="relative w-full h-screen flex flex-col">
      </section>
    </>
  )
}
