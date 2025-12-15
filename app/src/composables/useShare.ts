import { useToast } from '@/components/ui/toast/use-toast'

type ShareOptions = {
  title?: string
  text?: string
  url: string
}

export function useShare() {
  const { toast } = useToast()

  async function share(options: ShareOptions) {
    const { title, text, url } = options

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url })
        return true
      } catch (err) {
        // If user cancels share, just return false silently
        return false
      }
    }

    try {
      await navigator.clipboard.writeText(url)
      toast({ title: 'Link copied', description: 'Share link copied to clipboard' })
      return true
    } catch (err) {
      toast({
        title: 'Share not available',
        description: 'Copy the link manually from the address bar',
        variant: 'destructive'
      })
      return false
    }
  }

  return { share }
}
