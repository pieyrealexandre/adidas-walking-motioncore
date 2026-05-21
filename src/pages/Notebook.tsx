// Ported from bball repo (src/pages/Notebook.tsx).
//
// Deltas vs bball:
//   - All saved_copy + copy_projects reads filter by category = 'running-japan'.
//   - Notebook only reads/updates/deletes; INSERTs happen via CopyGenerator,
//     which is responsible for tagging new rows with the right category.
//   - PDF/CSV export, dialogs, touchpoint filter all verbatim.

import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Copy, Download, Edit2, FolderOpen, Loader2, Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { CATEGORY_SLUG } from '@/running-japan'
import { toast } from 'sonner'

interface SavedCopyItem {
  id: string
  headline?: string
  body?: string
  subject?: string
  preheader?: string
  snippet?: string
  full_text?: string
  touchpoint: string
  character_count: number
  original_prompt?: string
  product_name?: string
  is_kids: boolean
  format_type?: string
  created_at: string
  project_id?: string
  copy_projects?: {
    name: string
  }
}

interface CopyProject {
  id: string
  name: string
  created_at: string
}

const Notebook = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('id')

  const [savedCopy, setSavedCopy] = useState<SavedCopyItem[]>([])
  const [allProjects, setAllProjects] = useState<CopyProject[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedTouchpoint, setSelectedTouchpoint] = useState<string>('all')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<string | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [projectToEdit, setProjectToEdit] = useState<{ id: string; name: string } | null>(null)
  const [newProjectName, setNewProjectName] = useState('')
  const [deleteProjectDialogOpen, setDeleteProjectDialogOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null)

  useEffect(() => {
    if (user) loadData()
  }, [user])

  const loadData = async () => {
    try {
      const [copyResult, projectsResult] = await Promise.all([
        supabase
          .from('saved_copy')
          .select('*, copy_projects(name)')
          .eq('category', CATEGORY_SLUG)
          .order('created_at', { ascending: false }),
        supabase
          .from('copy_projects')
          .select('*')
          .eq('category', CATEGORY_SLUG)
          .order('created_at', { ascending: false }),
      ])

      if (copyResult.error) throw copyResult.error
      if (projectsResult.error) throw projectsResult.error

      setSavedCopy(copyResult.data || [])
      setAllProjects(projectsResult.data || [])
    } catch {
      toast.error('Failed to load notebook data')
    } finally {
      setIsLoading(false)
    }
  }

  const loadSavedCopy = async () => {
    await loadData()
  }

  const confirmDelete = (id: string) => {
    setItemToDelete(id)
    setDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!itemToDelete) return
    try {
      const { error } = await supabase.from('saved_copy').delete().eq('id', itemToDelete)
      if (error) throw error
      setSavedCopy((prev) => prev.filter((item) => item.id !== itemToDelete))
      toast.success('Removed from Notebook')
    } catch {
      toast.error('Failed to delete copy')
    } finally {
      setDeleteDialogOpen(false)
      setItemToDelete(null)
    }
  }

  const handleCopyToClipboard = (item: SavedCopyItem) => {
    let text = ''
    if (item.subject) text += `Subject: ${item.subject}\n`
    if (item.preheader) text += `Preheader: ${item.preheader}\n`
    if (item.snippet) text += `Snippet: ${item.snippet}\n`
    if (item.headline) text += `Headline: ${item.headline}\n`
    if (item.body) text += `Body: ${item.body}\n`
    if (item.full_text) text += item.full_text
    navigator.clipboard.writeText(text.trim())
    toast.success('Copied to clipboard')
  }

  const handleEditProject = (e: React.MouseEvent, project: { id: string; name: string }) => {
    e.stopPropagation()
    setProjectToEdit(project)
    setNewProjectName(project.name)
    setEditDialogOpen(true)
  }

  const handleSaveProjectName = async () => {
    if (!projectToEdit || !newProjectName.trim()) return
    try {
      const { error } = await supabase
        .from('copy_projects')
        .update({ name: newProjectName.trim() })
        .eq('id', projectToEdit.id)
      if (error) throw error
      loadSavedCopy()
      toast.success('Project name updated')
    } catch {
      toast.error('Failed to update project name')
    } finally {
      setEditDialogOpen(false)
      setProjectToEdit(null)
      setNewProjectName('')
    }
  }

  const confirmDeleteProject = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    setProjectToDelete(projectId)
    setDeleteProjectDialogOpen(true)
  }

  const handleDeleteProject = async () => {
    if (!projectToDelete) return
    try {
      const { error } = await supabase.from('copy_projects').delete().eq('id', projectToDelete)
      if (error) throw error
      loadSavedCopy()
      toast.success('Project deleted')
    } catch {
      toast.error('Failed to delete project')
    } finally {
      setDeleteProjectDialogOpen(false)
      setProjectToDelete(null)
    }
  }

  // Active-project values used by the project detail view; defined before
  // the handlers below so PDF/CSV downloads can reference them.
  const projectCopy = projectId
    ? savedCopy.filter((item) => (item.project_id || 'no-project') === projectId)
    : []
  const projectFromList = projectId ? allProjects.find((p) => p.id === projectId) : undefined
  const projectName =
    projectFromList?.name ||
    projectCopy[0]?.copy_projects?.name ||
    (projectId === 'no-project' ? 'No Project' : projectId ? 'Unknown Project' : '')

  const handleDownloadPDF = async () => {
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF()
      let yPosition = 20
      const pageHeight = doc.internal.pageSize.height
      const margin = 20
      const lineHeight = 7

      doc.setFontSize(20)
      doc.text(projectName, margin, yPosition)
      yPosition += 15
      doc.setFontSize(10)
      doc.text(`${projectCopy.length} saved items`, margin, yPosition)
      yPosition += 15

      projectCopy.forEach((item, index) => {
        if (yPosition > pageHeight - 40) {
          doc.addPage()
          yPosition = 20
        }
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text(`${index + 1}. ${item.touchpoint}`, margin, yPosition)
        yPosition += lineHeight + 3
        doc.setFontSize(10)
        doc.setFont('helvetica', 'normal')

        const fields: Array<[string, string | undefined]> = [
          ['Subject', item.subject],
          ['Preheader', item.preheader],
          ['Snippet', item.snippet],
          ['Headline', item.headline],
          ['Body', item.body],
        ]
        for (const [label, value] of fields) {
          if (!value) continue
          doc.setFont('helvetica', 'bold')
          doc.text(`${label}:`, margin, yPosition)
          doc.setFont('helvetica', 'normal')
          yPosition += lineHeight
          const lines = doc.splitTextToSize(value, 170)
          doc.text(lines, margin, yPosition)
          yPosition += lineHeight * lines.length + 3
        }
        if (item.full_text) {
          const lines = doc.splitTextToSize(item.full_text, 170)
          doc.text(lines, margin, yPosition)
          yPosition += lineHeight * lines.length + 3
        }
        doc.setFontSize(8)
        doc.setTextColor(128, 128, 128)
        doc.text(`${item.character_count} characters`, margin, yPosition)
        doc.setTextColor(0, 0, 0)
        yPosition += lineHeight + 10
        doc.setFontSize(10)
      })

      const filename = `${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_copy.pdf`
      doc.save(filename)
      toast.success('PDF downloaded')
    } catch {
      toast.error('Failed to generate PDF')
    }
  }

  const handleDownloadCSV = () => {
    if (projectCopy.length === 0) return
    const headers = [
      'Touchpoint',
      'Subject',
      'Subject Chars',
      'Preheader',
      'Preheader Chars',
      'Snippet',
      'Snippet Chars',
      'Headline',
      'Headline Chars',
      'Body',
      'Body Chars',
      'Product',
      'Created At',
    ]
    const escapeCSV = (value: string | undefined | null): string => {
      if (!value) return ''
      const escaped = value.replace(/\n/g, ' ').replace(/"/g, '""')
      if (escaped.includes(',') || escaped.includes('"') || escaped.includes('\n')) {
        return `"${escaped}"`
      }
      return escaped
    }
    const rows = projectCopy.map((item) => [
      escapeCSV(item.touchpoint),
      escapeCSV(item.subject),
      item.subject ? String(item.subject.length) : '',
      escapeCSV(item.preheader),
      item.preheader ? String(item.preheader.length) : '',
      escapeCSV(item.snippet),
      item.snippet ? String(item.snippet.length) : '',
      escapeCSV(item.headline),
      item.headline ? String(item.headline.length) : '',
      escapeCSV(item.body),
      item.body ? String(item.body.length) : '',
      escapeCSV(item.product_name),
      new Date(item.created_at).toLocaleDateString(),
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_copy.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success('Spreadsheet downloaded')
  }

  // Project list view
  if (!projectId) {
    const copyByProject = savedCopy.reduce((acc, item) => {
      const pid = item.project_id || 'no-project'
      if (!acc[pid]) acc[pid] = []
      acc[pid].push(item)
      return acc
    }, {} as Record<string, SavedCopyItem[]>)

    const projectList: { id: string; name: string; items: SavedCopyItem[]; createdAt: string }[] = []
    allProjects.forEach((p) =>
      projectList.push({
        id: p.id,
        name: p.name,
        items: copyByProject[p.id] || [],
        createdAt: p.created_at,
      }),
    )
    if ((copyByProject['no-project'] || []).length > 0) {
      projectList.push({
        id: 'no-project',
        name: 'No Project',
        items: copyByProject['no-project'],
        createdAt: '1970-01-01',
      })
    }
    projectList.sort((a, b) => {
      const aLatest = a.items.length
        ? Math.max(...a.items.map((i) => new Date(i.created_at).getTime()))
        : new Date(a.createdAt).getTime()
      const bLatest = b.items.length
        ? Math.max(...b.items.map((i) => new Date(i.created_at).getTime()))
        : new Date(b.createdAt).getTime()
      return bLatest - aLatest
    })

    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Notebook</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your saved copy organized by projects
            </p>
          </div>
        </div>

        {projectList.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">
                No saved copy yet. Start by liking variations in the Copy Generator!
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projectList.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => navigate(`/notebook?id=${project.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <FolderOpen className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                      </div>
                      <CardDescription>
                        {project.items.length} saved {project.items.length === 1 ? 'item' : 'items'}
                      </CardDescription>
                    </div>
                    {project.id !== 'no-project' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={(e) => confirmDeleteProject(e, project.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(project.items.map((i) => i.touchpoint)))
                      .slice(0, 3)
                      .map((tp) => (
                        <Badge key={tp} variant="secondary" className="text-xs">
                          {tp}
                        </Badge>
                      ))}
                    {Array.from(new Set(project.items.map((i) => i.touchpoint))).length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +
                        {Array.from(new Set(project.items.map((i) => i.touchpoint))).length - 3} more
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <AlertDialog open={deleteProjectDialogOpen} onOpenChange={setDeleteProjectDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Project?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this project? All saved copy items will remain but
                will be moved to "No Project". This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteProject}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete Project
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  // Project detail view
  const uniqueTouchpoints = Array.from(new Set(projectCopy.map((item) => item.touchpoint)))
  const filteredCopy =
    selectedTouchpoint === 'all'
      ? projectCopy
      : projectCopy.filter((item) => item.touchpoint === selectedTouchpoint)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/notebook')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-foreground">{projectName}</h1>
            {projectId !== 'no-project' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() =>
                  handleEditProject(new MouseEvent('click') as any, { id: projectId, name: projectName })
                }
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleDownloadCSV}
            disabled={projectCopy.length === 0}
            variant="outline"
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Spreadsheet
          </Button>
          <Button onClick={handleDownloadPDF} disabled={projectCopy.length === 0} className="gap-2">
            <Download className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      {projectCopy.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={selectedTouchpoint === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedTouchpoint('all')}
          >
            All ({projectCopy.length})
          </Button>
          {uniqueTouchpoints.map((tp) => (
            <Button
              key={tp}
              variant={selectedTouchpoint === tp ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedTouchpoint(tp)}
            >
              {tp} ({projectCopy.filter((item) => item.touchpoint === tp).length})
            </Button>
          ))}
        </div>
      )}

      {filteredCopy.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {selectedTouchpoint === 'all'
                ? 'No saved copy in this project yet.'
                : `No saved copy for ${selectedTouchpoint}`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCopy.map((item) => (
            <Card key={item.id} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <CardTitle className="text-base">{item.touchpoint}</CardTitle>
                    {item.copy_projects && (
                      <p className="text-xs text-muted-foreground mt-1">{item.copy_projects.name}</p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant="secondary" className="text-xs">
                        {item.character_count} chars
                      </Badge>
                      {item.is_kids && (
                        <Badge variant="outline" className="text-xs">
                          Kids
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleCopyToClipboard(item)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => confirmDelete(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {item.subject && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Subject</div>
                    <div className="text-sm">{item.subject}</div>
                  </div>
                )}
                {item.preheader && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Preheader</div>
                    <div className="text-sm">{item.preheader}</div>
                  </div>
                )}
                {item.snippet && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Snippet</div>
                    <div className="text-sm">{item.snippet}</div>
                  </div>
                )}
                {item.headline && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Headline</div>
                    <div className="font-medium">{item.headline}</div>
                  </div>
                )}
                {item.body && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Body</div>
                    <div className="text-sm leading-relaxed">{item.body}</div>
                  </div>
                )}
                {item.full_text && (
                  <div className="text-sm leading-relaxed">{item.full_text}</div>
                )}
                {item.original_prompt && (
                  <div className="pt-3 mt-3 border-t">
                    <div className="text-xs font-semibold text-muted-foreground mb-1">Original Prompt</div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{item.original_prompt}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Copy?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this copy? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteProjectDialogOpen} onOpenChange={setDeleteProjectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this project? All saved copy items will remain but
              will be moved to "No Project". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project Name</DialogTitle>
            <DialogDescription>Change the name of this project</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveProjectName()}
                placeholder="Enter project name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveProjectName} disabled={!newProjectName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Notebook
