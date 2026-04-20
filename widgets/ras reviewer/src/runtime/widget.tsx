import { React, type AllWidgetProps } from 'jimu-core'
import React, { useEffect, useRef, useState } from 'react'
import FeatureLayer from '@arcgis/core/layers/FeatureLayer'
import Graphic from '@arcgis/core/Graphic'
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import { type IMConfig } from '../config'
import ConfirmModal from './components/confirm-modal'
import './app.css'

type ReviewDecision = 'Approved' | 'Rejected' | ''

type UrlState = {
  allotmentNumber: string
  officeId: string
}

type PolygonSummary = {
  objectId: string
  allotmentNumber: string
  officeId: string
  officeName: string
  joinValue: string
  geometry?: __esri.Geometry
}

type TableRecordSummary = {
  objectId: string
  decision: string
  comments: string
  joinValue: string
}

function readUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search)

  return {
    allotmentNumber: params.get('allotmentNR') || '',
    officeId: params.get('officeid') || ''
  }
}

function buildWhereClause(fieldName: string, value: string): string {
  const safeValue = value.replace(/'/g, "''")
  return `${fieldName} = '${safeValue}'`
}

function buildAndWhereClause(firstField: string, firstValue: string, secondField: string, secondValue: string): string {
  return `${buildWhereClause(firstField, firstValue)} AND ${buildWhereClause(secondField, secondValue)}`
}

function createHighlightGraphic(geometry: __esri.Geometry): Graphic {
  return new Graphic({
    geometry: geometry,
    symbol: new SimpleFillSymbol({
      color: [76, 111, 255, 0.15],
      outline: {
        color: [76, 111, 255, 1],
        width: 2
      }
    })
  })
}

function createFeatureLayer(url: string): FeatureLayer {
  return new FeatureLayer({
    url: url,
    outFields: ['*']
  })
}

function getLayerTitle(layer: __esri.Layer): string {
  return layer.title || ''
}

function findLayerByTitle(map: __esri.Map, title: string): FeatureLayer | null {
  if (!title) {
    return null
  }

  let matchedLayer: FeatureLayer | null = null

  map.layers.forEach((layer) => {
    if (matchedLayer) {
      return
    }

    if (layer.type === 'feature' && getLayerTitle(layer) === title) {
      matchedLayer = layer as FeatureLayer
    }
  })

  return matchedLayer
}

function findTableByTitle(map: __esri.Map, title: string): FeatureLayer | null {
  if (!title || !map.tables) {
    return null
  }

  let matchedTable: FeatureLayer | null = null

  map.tables.forEach((table) => {
    if (matchedTable) {
      return
    }

    if (table.type === 'feature' && getLayerTitle(table) === title) {
      matchedTable = table as FeatureLayer
    }
  })

  return matchedTable
}

function chunkValues(values: string[], size: number): string[][] {
  const chunks: string[][] = []

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}

function buildInClause(fieldName: string, values: string[]): string {
  const quotedValues = values.map((value) => `'${value.replace(/'/g, "''")}'`)
  return `${fieldName} IN (${quotedValues.join(', ')})`
}

function getApprovalModeLabel(value: string): string {
  if (value === 'Approved' || value === 'Rejected') {
    return value
  }

  return 'Unallocated'
}

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const { config, useMapWidgetIds } = props

  const [urlState, setUrlState] = useState<UrlState>({
    allotmentNumber: '',
    officeId: ''
  })
  const [activePolygon, setActivePolygon] = useState<PolygonSummary | null>(null)
  const [activeTableRecord, setActiveTableRecord] = useState<TableRecordSummary | null>(null)
  const [decision, setDecision] = useState<ReviewDecision>('')
  const [rejectComments, setRejectComments] = useState('')
  const [statusMessage, setStatusMessage] = useState('Waiting for review target.')
  const [statusType, setStatusType] = useState<'info' | 'success' | 'error'>('info')
  const [isLoading, setIsLoading] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showApproved, setShowApproved] = useState(true)
  const [showRejected, setShowRejected] = useState(true)
  const [jimuMapView, setJimuMapView] = useState<JimuMapView | null>(null)
  const [polygonLayer, setPolygonLayer] = useState<FeatureLayer | null>(null)
  const [reviewTable, setReviewTable] = useState<FeatureLayer | null>(null)
  const highlightGraphicRef = useRef<Graphic | null>(null)

  useEffect(() => {
    setUrlState(readUrlState())
  }, [])

  useEffect(() => {
    if (!jimuMapView) {
      return
    }

    const map = jimuMapView.view.map
    const matchedPolygonLayer = findLayerByTitle(map, config.polygonLayerTitle || '')
    const matchedReviewTable = findTableByTitle(map, config.reviewTableTitle || '')

    if (matchedPolygonLayer) {
      setPolygonLayer(matchedPolygonLayer)
    } else if (config.polygonLayerUrl) {
      setPolygonLayer(createFeatureLayer(config.polygonLayerUrl))
    } else {
      setPolygonLayer(null)
    }

    if (matchedReviewTable) {
      setReviewTable(matchedReviewTable)
    } else if (config.reviewTableUrl) {
      setReviewTable(createFeatureLayer(config.reviewTableUrl))
    } else {
      setReviewTable(null)
    }
  }, [jimuMapView, config])

  useEffect(() => {
    if (!urlState.allotmentNumber || !urlState.officeId) {
      return
    }

    void loadReviewTargetFromUrl(urlState.allotmentNumber, urlState.officeId)
  }, [urlState.allotmentNumber, urlState.officeId, polygonLayer, reviewTable])

  useEffect(() => {
    if (!jimuMapView || !polygonLayer) {
      return
    }

    const map = jimuMapView.view.map
    const alreadyInMap = map.layers.some((layer) => {
      return layer.type === 'feature' && (layer as FeatureLayer).url === polygonLayer.url
    })

    if (!alreadyInMap && config.polygonLayerUrl && polygonLayer.url === config.polygonLayerUrl) {
      map.add(polygonLayer)
    }

    const clickHandle = jimuMapView.view.on('click', async (event) => {
      try {
        const hitResponse = await jimuMapView.view.hitTest(event)
        let graphic = null

        for (const result of hitResponse.results) {
          if (result.graphic?.layer === polygonLayer) {
            graphic = result.graphic
            break
          }
        }

        if (!graphic) {
          return
        }

        const attributes = graphic.attributes || {}
        const polygonFieldName = config.polygonIdField || 'ST_ALLOT'
        const officeFieldName = config.officeField || 'officeid'
        const joinFieldName = config.polygonJoinField || 'Original_GlobalID'

        const allotmentNumber = String(attributes[polygonFieldName] || '')
        const officeId = String(attributes[officeFieldName] || '')
        const joinValue = String(attributes[joinFieldName] || '')
        const officeName = String(attributes.OFFICE || '')

        if (!allotmentNumber || !joinValue) {
          return
        }

        await loadReviewTargetFromPolygon({
          objectId: String(attributes.OBJECTID || ''),
          allotmentNumber: allotmentNumber,
          officeId: officeId,
          officeName: officeName,
          joinValue: joinValue,
          geometry: graphic.geometry
        })
      } catch (error) {
        console.error(error)
      }
    })

    return () => {
      clickHandle.remove()
    }
  }, [jimuMapView, polygonLayer, config])

  useEffect(() => {
    if (!jimuMapView || !activePolygon?.geometry) {
      return
    }

    void zoomToAndHighlightGeometry(activePolygon.geometry)
  }, [jimuMapView, activePolygon?.geometry])

  useEffect(() => {
    void applyApprovalFilter()
  }, [showApproved, showRejected, polygonLayer, reviewTable])

  async function applyApprovalFilter() {
    if (!polygonLayer || !reviewTable) {
      return
    }

    const approvalField = config.approvalField || 'APPROVAL_FLAG'
    const tableJoinField = config.tableJoinField || 'Original_GlobalID'
    const polygonJoinField = config.polygonJoinField || 'Original_GlobalID'

    if (showApproved && showRejected) {
      polygonLayer.definitionExpression = ''
      return
    }

    if (!showApproved && !showRejected) {
      polygonLayer.definitionExpression = '1 = 0'
      clearSelectionBecauseOfFilter()
      return
    }

    const approvalValues: string[] = []

    if (showApproved) {
      approvalValues.push('Approved')
    }

    if (showRejected) {
      approvalValues.push('Rejected')
    }

    const valueClauses = approvalValues.map((value) => buildWhereClause(approvalField, value))
    const tableQuery = reviewTable.createQuery()
    tableQuery.where = valueClauses.join(' OR ')
    tableQuery.outFields = [tableJoinField]
    tableQuery.returnGeometry = false

    try {
      const tableResult = await reviewTable.queryFeatures(tableQuery)
      const joinValues: string[] = []

      for (const feature of tableResult.features) {
        const joinValue = String(feature.attributes?.[tableJoinField] || '')
        if (joinValue) {
          joinValues.push(joinValue)
        }
      }

      if (joinValues.length === 0) {
        polygonLayer.definitionExpression = '1 = 0'
        clearSelectionBecauseOfFilter()
        return
      }

      const uniqueJoinValues = Array.from(new Set(joinValues))
      const valueChunks = chunkValues(uniqueJoinValues, 200)
      const chunkClauses = valueChunks.map((chunk) => `(${buildInClause(polygonJoinField, chunk)})`)

      polygonLayer.definitionExpression = chunkClauses.join(' OR ')

      if (activePolygon && !uniqueJoinValues.includes(activePolygon.joinValue)) {
        clearSelectionBecauseOfFilter()
      }
    } catch (error) {
      console.error(error)
      setStatusType('error')
      setStatusMessage('Failed to apply approved/rejected map filter.')
    }
  }

  function clearSelectionBecauseOfFilter() {
    setActivePolygon(null)
    setActiveTableRecord(null)
    setDecision('')
    setRejectComments('')
    setStatusType('info')
    setStatusMessage('Current selection was cleared because it no longer matches the active filter.')

    if (highlightGraphicRef.current && jimuMapView) {
      jimuMapView.view.graphics.remove(highlightGraphicRef.current)
      highlightGraphicRef.current = null
    }
  }

  async function loadReviewTargetFromUrl(allotmentNumber: string, officeId: string) {
    if (!polygonLayer) {
      setStatusType('error')
      setStatusMessage('Configure the polygon layer first.')
      return
    }

    setIsLoading(true)
    setStatusType('info')
    setStatusMessage('Loading polygon from launch URL...')

    try {
      const polygonIdField = config.polygonIdField || 'ST_ALLOT'
      const officeField = config.officeField || 'officeid'
      const joinField = config.polygonJoinField || 'Original_GlobalID'

      const polygonQuery = polygonLayer.createQuery()
      polygonQuery.where = buildAndWhereClause(polygonIdField, allotmentNumber, officeField, officeId)
      polygonQuery.returnGeometry = true
      polygonQuery.outFields = ['*']

      const polygonResult = await polygonLayer.queryFeatures(polygonQuery)
      const polygonFeature = polygonResult.features[0]

      if (!polygonFeature) {
        setActivePolygon(null)
        setActiveTableRecord(null)
        setDecision('')
        setRejectComments('')
        setStatusType('error')
        setStatusMessage('No polygon matched the launch URL parameters.')
        return
      }

      const polygonAttributes = polygonFeature.attributes || {}
      const joinValue = String(polygonAttributes[joinField] || '')

      if (!joinValue) {
        setStatusType('error')
        setStatusMessage('Polygon found, but Original_GlobalID is missing.')
        return
      }

      await loadReviewTargetFromPolygon({
        objectId: String(polygonAttributes.OBJECTID || ''),
        allotmentNumber: String(polygonAttributes[polygonIdField] || allotmentNumber),
        officeId: String(polygonAttributes[officeField] || officeId),
        officeName: String(polygonAttributes.OFFICE || ''),
        joinValue: joinValue,
        geometry: polygonFeature.geometry
      })
    } catch (error) {
      console.error(error)
      setStatusType('error')
      setStatusMessage('Failed to load the polygon from the launch URL.')
    } finally {
      setIsLoading(false)
    }
  }

  async function loadReviewTargetFromPolygon(polygon: PolygonSummary) {
    if (!reviewTable) {
      setStatusType('error')
      setStatusMessage('Configure the review table first.')
      return
    }

    setIsLoading(true)
    setStatusType('info')
    setStatusMessage('Loading review record...')

    try {
      setActivePolygon(polygon)

      const tableJoinField = config.tableJoinField || 'Original_GlobalID'
      const approvalField = config.approvalField || 'APPROVAL_FLAG'
      const commentsField = config.commentsField || 'Comments'

      const tableQuery = reviewTable.createQuery()
      tableQuery.where = buildWhereClause(tableJoinField, polygon.joinValue)
      tableQuery.outFields = ['*']
      tableQuery.returnGeometry = false

      const tableResult = await reviewTable.queryFeatures(tableQuery)
      const tableFeature = tableResult.features[0]

      if (!tableFeature) {
        setActiveTableRecord(null)
        setDecision('')
        setRejectComments('')
        setStatusType('error')
        setStatusMessage('Polygon found, but no related table record was found.')
        return
      }

      const tableAttributes = tableFeature.attributes || {}
      const existingDecision = String(tableAttributes[approvalField] || '')
      const existingComments = String(tableAttributes[commentsField] || '')

      setActiveTableRecord({
        objectId: String(tableAttributes.OBJECTID || ''),
        decision: existingDecision,
        comments: existingComments,
        joinValue: String(tableAttributes[tableJoinField] || '')
      })

      if (existingDecision === 'Approved' || existingDecision === 'Rejected') {
        setDecision(existingDecision)
      } else {
        setDecision('')
      }

      setRejectComments(existingComments)
      setStatusType('success')
      setStatusMessage('Review target loaded.')
    } catch (error) {
      console.error(error)
      setStatusType('error')
      setStatusMessage('Failed to load the related review record.')
    } finally {
      setIsLoading(false)
    }
  }

  async function zoomToAndHighlightGeometry(geometry: __esri.Geometry) {
    if (!jimuMapView) {
      return
    }

    try {
      if (highlightGraphicRef.current) {
        jimuMapView.view.graphics.remove(highlightGraphicRef.current)
      }

      const highlightGraphic = createHighlightGraphic(geometry)
      highlightGraphicRef.current = highlightGraphic
      jimuMapView.view.graphics.add(highlightGraphic)
      await jimuMapView.view.goTo(geometry)
    } catch (error) {
      console.error(error)
    }
  }

  function startSubmitDecision() {
    if (!reviewTable || !activeTableRecord) {
      setStatusType('error')
      setStatusMessage('No review table record is ready to update.')
      return
    }

    if (!decision) {
      setStatusType('error')
      setStatusMessage('Select Approved or Rejected first.')
      return
    }

    if (decision === 'Rejected' && !rejectComments.trim()) {
      setStatusType('error')
      setStatusMessage('Enter a rejection reason before saving.')
      return
    }

    setShowConfirmModal(true)
  }

  async function submitDecision() {
    if (!reviewTable || !activeTableRecord) {
      setStatusType('error')
      setStatusMessage('No review table record is ready to update.')
      setShowConfirmModal(false)
      return
    }

    setIsLoading(true)
    setStatusType('info')
    setStatusMessage('Saving review decision...')

    try {
      const approvalField = config.approvalField || 'APPROVAL_FLAG'
      const commentsField = config.commentsField || 'Comments'

      const updateFeature = {
        attributes: {
          OBJECTID: Number(activeTableRecord.objectId),
          [approvalField]: decision,
          [commentsField]: decision === 'Rejected' ? rejectComments : ''
        }
      }

      const editResult = await reviewTable.applyEdits({
        updateFeatures: [updateFeature]
      })

      const updateResult = editResult.updateFeatureResults && editResult.updateFeatureResults[0]
      if (updateResult && updateResult.success) {
        setActiveTableRecord({
          ...activeTableRecord,
          decision: decision,
          comments: decision === 'Rejected' ? rejectComments : ''
        })
        setStatusType('success')
        setStatusMessage('Review decision saved successfully.')
        await applyApprovalFilter()
      } else {
        setStatusType('error')
        setStatusMessage('The review decision could not be saved.')
      }
    } catch (error) {
      console.error(error)
      setStatusType('error')
      setStatusMessage('Failed to save the review decision.')
    } finally {
      setIsLoading(false)
      setShowConfirmModal(false)
    }
  }

  function handleClose() {
    window.history.back()
  }

  return (
    <div className='widget-demo jimu-widget m-2 ras-review-widget'>
      <JimuMapViewComponent
        useMapWidgetId={useMapWidgetIds?.[0]}
        onActiveViewChange={(view) => setJimuMapView(view || null)}
      />

      <div className='reviewer-container'>
        <h3>RAS Data Review</h3>

        <div className='reviewer-section'>
          <label><strong>Map Filter</strong></label>
          <label className='checkbox-row'>
            <input
              type='checkbox'
              checked={showApproved}
              onChange={(event) => setShowApproved(event.target.checked)}
            />
            <span>Show Approved</span>
          </label>
          <label className='checkbox-row'>
            <input
              type='checkbox'
              checked={showRejected}
              onChange={(event) => setShowRejected(event.target.checked)}
            />
            <span>Show Rejected</span>
          </label>
        </div>

        <div className='reviewer-section'>
          <div><strong>Allotment:</strong> {activePolygon?.allotmentNumber || urlState.allotmentNumber || 'Not set'}</div>
          <div><strong>Office ID:</strong> {activePolygon?.officeId || urlState.officeId || 'Not set'}</div>
          <div><strong>Office:</strong> {activePolygon?.officeName || 'Not set'}</div>
        </div>

        <div className='reviewer-section'>
          <div><strong>Approval Mode:</strong> {getApprovalModeLabel(activeTableRecord?.decision || '')}</div>
        </div>

        <div className='reviewer-section'>
          <label htmlFor='review-decision'><strong>New Decision</strong></label>
          <select
            id='review-decision'
            className='review-select'
            value={decision}
            onChange={(event) => setDecision(event.target.value as ReviewDecision)}
          >
            <option value=''>Select a decision</option>
            <option value='Approved'>Approved</option>
            <option value='Rejected'>Rejected</option>
          </select>

          {decision === 'Rejected' ? (
            <>
              <label htmlFor='reject-comments'><strong>Reject Reason</strong></label>
              <textarea
                id='reject-comments'
                className='review-textarea'
                value={rejectComments}
                onChange={(event) => setRejectComments(event.target.value)}
                rows={4}
                placeholder='Enter the reason for rejection'
              />
            </>
          ) : null}
        </div>

        <div className='reviewer-section'>
          <div><strong>Current Comments:</strong> {activeTableRecord?.comments || 'None'}</div>
          <div className={`status-text ${statusType}`}>{statusMessage}</div>
        </div>

        <div className='button-row'>
          <button className='review-button' onClick={startSubmitDecision} disabled={isLoading}>
            {isLoading ? 'Working...' : 'Submit Review'}
          </button>
          <button className='review-button secondary' onClick={handleClose}>
            Close
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirmModal}
        title={decision === 'Rejected' ? 'Confirm rejection' : 'Confirm approval'}
        message={decision === 'Rejected'
          ? `Are you sure you want to reject this record? Reason: ${rejectComments}`
          : 'Are you sure you want to approve this record?'}
        onConfirm={submitDecision}
        onCancel={() => setShowConfirmModal(false)}
      />
    </div>
  )
}

export default Widget
