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
  allotmentName: string
  joinValue: string
  geometry?: __esri.Geometry
}

type TableRecordSummary = {
  objectId: string
  decision: string
  comments: string
  joinValue: string
}

function logDebug(label: string, value?: unknown) {
  console.log(`[RAS Reviewer] ${label}`, value)
}

function readUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search)
  const urlState = {
    allotmentNumber: params.get('allotmentNr') || '',
    officeId: params.get('officeId') || ''
  }

  logDebug('Read URL params', urlState)
  return urlState
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
  logDebug('Creating fallback feature layer', url)
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
    logDebug('Inspecting map layer', { title: layer.title, type: layer.type, url: (layer as FeatureLayer).url })

    if (matchedLayer) {
      return
    }

    if (layer.type === 'feature' && getLayerTitle(layer) === title) {
      matchedLayer = layer as FeatureLayer
    }
  })

  logDebug('Matched polygon layer by title', matchedLayer ? { title: matchedLayer.title, url: matchedLayer.url } : null)
  return matchedLayer
}

function findTableByTitle(map: __esri.Map, title: string): FeatureLayer | null {
  if (!title || !map.tables) {
    return null
  }

  let matchedTable: FeatureLayer | null = null

  map.tables.forEach((table) => {
    logDebug('Inspecting map table', { title: table.title, type: table.type, url: (table as FeatureLayer).url })

    if (matchedTable) {
      return
    }

    if (table.type === 'feature' && getLayerTitle(table) === title) {
      matchedTable = table as FeatureLayer
    }
  })

  logDebug('Matched review table by title', matchedTable ? { title: matchedTable.title, url: matchedTable.url } : null)
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

  logDebug('Render state', {
    useMapWidgetIds,
    polygonLayerTitle: config.polygonLayerTitle,
    reviewTableTitle: config.reviewTableTitle
  })

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
  const [isDataReady, setIsDataReady] = useState(false)
  const highlightGraphicRef = useRef<Graphic | null>(null)

  useEffect(() => {
    logDebug('Initial URL state effect fired')
    setUrlState(readUrlState())
  }, [])

  useEffect(() => {
    logDebug('Data source setup effect fired', {
      hasMapView: Boolean(jimuMapView),
      polygonLayerTitle: config.polygonLayerTitle,
      reviewTableTitle: config.reviewTableTitle
    })

    if (!jimuMapView) {
      logDebug('Skipping data source setup because map view is not ready')
      return
    }

    let cancelled = false

    async function setupDataSources() {
      setIsDataReady(false)
      setStatusType('info')
      setStatusMessage('Waiting for map and data sources...')

      try {
        logDebug('Waiting for jimuMapView.view.when()')
        await jimuMapView.view.when()
        logDebug('Map view is ready')

        logDebug('Waiting for map.load()')
        await jimuMapView.view.map.load()
        logDebug('Map is loaded')

        if (cancelled) {
          logDebug('Setup cancelled before resolving layers')
          return
        }

        const map = jimuMapView.view.map
        logDebug('Map layer count', map.layers.length)
        logDebug('Map table count', map.tables ? map.tables.length : 0)

        const matchedPolygonLayer = findLayerByTitle(map, config.polygonLayerTitle || '')
        const matchedReviewTable = findTableByTitle(map, config.reviewTableTitle || '')

        let resolvedPolygonLayer: FeatureLayer | null = null
        let resolvedReviewTable: FeatureLayer | null = null

        if (matchedPolygonLayer) {
          resolvedPolygonLayer = matchedPolygonLayer
        } else if (config.polygonLayerUrl) {
          resolvedPolygonLayer = createFeatureLayer(config.polygonLayerUrl)
        }

        if (matchedReviewTable) {
          resolvedReviewTable = matchedReviewTable
        } else if (config.reviewTableUrl) {
          resolvedReviewTable = createFeatureLayer(config.reviewTableUrl)
        }

        if (cancelled) {
          logDebug('Setup cancelled after resolving layers')
          return
        }

        logDebug('Resolved polygon layer', resolvedPolygonLayer ? { title: resolvedPolygonLayer.title, url: resolvedPolygonLayer.url } : null)
        logDebug('Resolved review table', resolvedReviewTable ? { title: resolvedReviewTable.title, url: resolvedReviewTable.url } : null)

        setPolygonLayer(resolvedPolygonLayer)
        setReviewTable(resolvedReviewTable)

        if (resolvedPolygonLayer && resolvedReviewTable) {
          setIsDataReady(true)
          setStatusType('info')
          setStatusMessage('Map and data sources are ready.')
          logDebug('Data sources are ready')
        } else {
          setStatusType('error')
          setStatusMessage('Could not resolve the polygon layer or review table.')
          logDebug('Failed to resolve one or more data sources')
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setStatusType('error')
          setStatusMessage('Failed to initialize the map and data sources.')
          logDebug('Data source setup failed', error)
        }
      }
    }

    void setupDataSources()

    return () => {
      cancelled = true
      logDebug('Cleaning up data source setup effect')
    }
  }, [jimuMapView, config])

  useEffect(() => {
    logDebug('URL launch effect fired', {
      isDataReady,
      allotmentNumber: urlState.allotmentNumber,
      officeId: urlState.officeId
    })

    if (!isDataReady) {
      return
    }

    if (!urlState.allotmentNumber || !urlState.officeId) {
      logDebug('Skipping URL launch because required params are missing')
      return
    }

    void loadReviewTargetFromUrl(urlState.allotmentNumber, urlState.officeId)
  }, [isDataReady, urlState.allotmentNumber, urlState.officeId])

  useEffect(() => {
    logDebug('Map click binding effect fired', {
      isDataReady,
      hasMapView: Boolean(jimuMapView),
      hasPolygonLayer: Boolean(polygonLayer)
    })

    if (!isDataReady || !jimuMapView || !polygonLayer) {
      return
    }

    const map = jimuMapView.view.map
    const alreadyInMap = map.layers.some((layer) => {
      return layer.type === 'feature' && (layer as FeatureLayer).url === polygonLayer.url
    })

    if (!alreadyInMap && config.polygonLayerUrl && polygonLayer.url === config.polygonLayerUrl) {
      logDebug('Adding fallback polygon layer to map', polygonLayer.url)
      map.add(polygonLayer)
    }

    const clickHandle = jimuMapView.view.on('click', async (event) => {
      logDebug('Map clicked')

      try {
        const hitResponse = await jimuMapView.view.hitTest(event)
        logDebug('Hit test result count', hitResponse.results.length)
        let graphic = null

        for (const result of hitResponse.results) {
          const hitLayer = result.graphic?.layer as FeatureLayer | undefined
          if (!hitLayer || !polygonLayer) {
            continue
          }

          const sameInstance = hitLayer === polygonLayer
          const sameTitle = hitLayer.title === polygonLayer.title
          const sameUrl = hitLayer.url === polygonLayer.url

          logDebug('Inspecting hit graphic layer', {
            hitTitle: hitLayer.title,
            hitUrl: hitLayer.url,
            sameInstance,
            sameTitle,
            sameUrl
          })

          if (sameInstance || sameTitle || sameUrl) {
            graphic = result.graphic
            break
          }
        }

        if (!graphic) {
          logDebug('No matching polygon graphic found in hit test')
          return
        }

        const attributes = graphic.attributes || {}
        const polygonFieldName = config.polygonIdField || 'ST_ALLOT'
        const officeFieldName = config.officeField || 'officeid'
        const joinFieldName = config.polygonJoinField || 'Original_GlobalID'

        const allotmentNumber = String(attributes[polygonFieldName] || '')
        const officeId = String(attributes[officeFieldName] || '')
        const joinValue = String(attributes[joinFieldName] || '')
        const allotmentName = String(attributes.ALLOT_NAME || '')

        logDebug('Resolved clicked polygon attributes', {
          allotmentNumber,
          officeId,
          joinValue,
          allotmentName
        })

        if (!allotmentNumber || !joinValue) {
          logDebug('Clicked polygon is missing allotment number or join value')
          return
        }

        await loadReviewTargetFromPolygon({
          objectId: String(attributes.OBJECTID || ''),
          allotmentNumber: allotmentNumber,
          officeId: officeId,
          allotmentName: allotmentName,
          joinValue: joinValue,
          geometry: graphic.geometry
        })
      } catch (error) {
        console.error(error)
        logDebug('Map click handler failed', error)
      }
    })

    return () => {
      clickHandle.remove()
      logDebug('Removed map click handler')
    }
  }, [isDataReady, jimuMapView, polygonLayer, config])

  useEffect(() => {
    if (!isDataReady || !jimuMapView || !activePolygon?.geometry) {
      return
    }

    void zoomToAndHighlightGeometry(activePolygon.geometry)
  }, [isDataReady, jimuMapView, activePolygon?.geometry])

  useEffect(() => {
    logDebug('Approval filter effect fired', {
      isDataReady,
      showApproved,
      showRejected,
      hasPolygonLayer: Boolean(polygonLayer),
      hasReviewTable: Boolean(reviewTable)
    })

    if (!isDataReady) {
      return
    }

    void applyApprovalFilter()
  }, [isDataReady, showApproved, showRejected, polygonLayer, reviewTable])

  async function applyApprovalFilter() {
    if (!polygonLayer || !reviewTable) {
      return
    }

    const approvalField = config.approvalField || 'APPROVAL_FLAG'
    const tableJoinField = config.tableJoinField || 'Original_GlobalID'
    const polygonJoinField = config.polygonJoinField || 'Original_GlobalID'

    logDebug('Applying approval filter', {
      approvalField,
      tableJoinField,
      polygonJoinField,
      showApproved,
      showRejected
    })

    if (showApproved && showRejected) {
      polygonLayer.definitionExpression = ''
      logDebug('Showing all polygons, cleared definitionExpression')
      return
    }

    if (!showApproved && !showRejected) {
      polygonLayer.definitionExpression = '1 = 0'
      logDebug('Showing no polygons')
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

      logDebug('Approval filter matched join values', joinValues)

      if (joinValues.length === 0) {
        polygonLayer.definitionExpression = '1 = 0'
        clearSelectionBecauseOfFilter()
        return
      }

      const uniqueJoinValues = Array.from(new Set(joinValues))
      const valueChunks = chunkValues(uniqueJoinValues, 200)
      const chunkClauses = valueChunks.map((chunk) => `(${buildInClause(polygonJoinField, chunk)})`)

      polygonLayer.definitionExpression = chunkClauses.join(' OR ')
      logDebug('Applied polygon definitionExpression', polygonLayer.definitionExpression)

      if (activePolygon && !uniqueJoinValues.includes(activePolygon.joinValue)) {
        clearSelectionBecauseOfFilter()
      }
    } catch (error) {
      console.error(error)
      setStatusType('error')
      setStatusMessage('Failed to apply approved/rejected map filter.')
      logDebug('Approval filter failed', error)
    }
  }

  function clearSelectionBecauseOfFilter() {
    logDebug('Clearing selection because of active filter')
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
    logDebug('Loading review target from URL', { allotmentNumber, officeId })

    try {
      const polygonIdField = config.polygonIdField || 'ST_ALLOT'
      const officeField = config.officeField || 'officeid'
      const joinField = config.polygonJoinField || 'Original_GlobalID'

      const polygonQuery = polygonLayer.createQuery()
      polygonQuery.where = buildAndWhereClause(polygonIdField, allotmentNumber, officeField, officeId)
      polygonQuery.returnGeometry = true
      polygonQuery.outFields = ['*']
      logDebug('Polygon query from URL', polygonQuery.where)

      const polygonResult = await polygonLayer.queryFeatures(polygonQuery)
      const polygonFeature = polygonResult.features[0]
      logDebug('Polygon query result count', polygonResult.features.length)

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
        allotmentName: String(polygonAttributes.ALLOT_NAME || ''),
        joinValue: joinValue,
        geometry: polygonFeature.geometry
      })
    } catch (error) {
      console.error(error)
      setStatusType('error')
      setStatusMessage('Failed to load the polygon from the launch URL.')
      logDebug('URL launch load failed', error)
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
    logDebug('Loading review target from polygon', polygon)

    try {
      setActivePolygon(polygon)

      const tableJoinField = config.tableJoinField || 'Original_GlobalID'
      const approvalField = config.approvalField || 'APPROVAL_FLAG'
      const commentsField = config.commentsField || 'Comments'

      const tableQuery = reviewTable.createQuery()
      tableQuery.where = buildWhereClause(tableJoinField, polygon.joinValue)
      tableQuery.outFields = ['*']
      tableQuery.returnGeometry = false
      logDebug('Related table query', tableQuery.where)

      const tableResult = await reviewTable.queryFeatures(tableQuery)
      const tableFeature = tableResult.features[0]
      logDebug('Related table query result count', tableResult.features.length)

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
      logDebug('Loaded related table record', {
        objectId: tableAttributes.OBJECTID,
        existingDecision,
        existingComments
      })
    } catch (error) {
      console.error(error)
      setStatusType('error')
      setStatusMessage('Failed to load the related review record.')
      logDebug('Related table load failed', error)
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
      logDebug('Zoomed to and highlighted geometry')
    } catch (error) {
      console.error(error)
      logDebug('Zoom/highlight failed', error)
    }
  }

  function startSubmitDecision() {
    logDebug('Submit review clicked', { decision, rejectComments })

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
    logDebug('Saving review decision', { decision, rejectComments, tableRecord: activeTableRecord })

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
      logDebug('applyEdits result', editResult)

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
      logDebug('applyEdits failed', error)
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
        onActiveViewChange={(view) => {
          logDebug('Active map view changed', {
            hasView: Boolean(view),
            useMapWidgetId: useMapWidgetIds?.[0] || null
          })
          setJimuMapView(view || null)
        }}
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
          <div><strong>Allotment Name:</strong> {activePolygon?.allotmentName || 'Not set'}</div>
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
          <button className='review-button' onClick={startSubmitDecision} disabled={isLoading || !isDataReady}>
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
