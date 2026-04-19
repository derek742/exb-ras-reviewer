import { React, type AllWidgetProps } from 'jimu-core'
import React, { useEffect, useRef, useState } from 'react'
import FeatureLayer from '@arcgis/core/layers/FeatureLayer'
import Graphic from '@arcgis/core/Graphic'
import SimpleFillSymbol from '@arcgis/core/symbols/SimpleFillSymbol'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import { type IMConfig } from '../config'
import './app.css'

type ReviewDecision = 'Approve' | 'Reject' | ''

type UrlState = {
  allotmentNumber: string
  officeId: string
  appName: string
  appNumber: string
  taskId: string
}

type PolygonSummary = {
  objectId: string
  allotmentNumber: string
  officeId: string
  geometry?: __esri.Geometry
}

type TableRecordSummary = {
  objectId: string
  decision: string
  comments: string
}

function readUrlState(config: IMConfig): UrlState {
  const params = new URLSearchParams(window.location.search)
  const polygonParamName = config?.polygonUrlParam || 'allotmentNR'
  const officeParamName = config?.officeUrlParam || 'officeid'

  return {
    allotmentNumber: params.get(polygonParamName) || '',
    officeId: params.get(officeParamName) || '',
    appName: params.get('appName') || '',
    appNumber: params.get('appNumber') || '',
    taskId: params.get('taskId') || ''
  }
}

function buildWhereClause(fieldName: string, value: string): string {
  const safeValue = value.replace(/'/g, "''")
  return `${fieldName} = '${safeValue}'`
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

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const { config, useMapWidgetIds } = props

  const [urlState, setUrlState] = useState<UrlState>({
    allotmentNumber: '',
    officeId: '',
    appName: '',
    appNumber: '',
    taskId: ''
  })
  const [activePolygon, setActivePolygon] = useState<PolygonSummary | null>(null)
  const [activeTableRecord, setActiveTableRecord] = useState<TableRecordSummary | null>(null)
  const [decision, setDecision] = useState<ReviewDecision>('')
  const [rejectComments, setRejectComments] = useState('')
  const [statusMessage, setStatusMessage] = useState('Waiting for review target.')
  const [isLoading, setIsLoading] = useState(false)
  const [jimuMapView, setJimuMapView] = useState<JimuMapView | null>(null)
  const [polygonLayer, setPolygonLayer] = useState<FeatureLayer | null>(null)
  const [reviewTable, setReviewTable] = useState<FeatureLayer | null>(null)
  const highlightGraphicRef = useRef<Graphic | null>(null)

  useEffect(() => {
    setUrlState(readUrlState(config))
  }, [config])

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
    if (!urlState.allotmentNumber) {
      return
    }

    void loadReviewTarget(urlState.allotmentNumber, urlState.officeId)
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
        const allotmentNumber = String(attributes[polygonFieldName] || '')
        const officeId = String(attributes[officeFieldName] || '')

        if (!allotmentNumber) {
          return
        }

        await loadReviewTarget(allotmentNumber, officeId, graphic.geometry)
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

  async function loadReviewTarget(allotmentNumber: string, officeId: string, knownGeometry?: __esri.Geometry) {
    if (!polygonLayer || !reviewTable) {
      setStatusMessage('Configure the polygon layer and review table first.')
      return
    }

    setIsLoading(true)
    setStatusMessage('Loading polygon and review record...')

    try {
      let polygonGeometry = knownGeometry
      let polygonOfficeId = officeId
      let polygonObjectId = ''

      if (!polygonGeometry) {
        const polygonQuery = polygonLayer.createQuery()
        polygonQuery.where = buildWhereClause(config.polygonIdField || 'ST_ALLOT', allotmentNumber)
        polygonQuery.returnGeometry = true
        polygonQuery.outFields = ['*']

        const polygonResult = await polygonLayer.queryFeatures(polygonQuery)
        const polygonFeature = polygonResult.features[0]

        if (!polygonFeature) {
          setActivePolygon(null)
          setActiveTableRecord(null)
          setDecision('')
          setRejectComments('')
          setStatusMessage('No polygon was found for that allotment.')
          return
        }

        const polygonAttributes = polygonFeature.attributes || {}
        polygonGeometry = polygonFeature.geometry
        polygonObjectId = String(polygonAttributes.OBJECTID || '')
        polygonOfficeId = String(polygonAttributes[config.officeField || 'officeid'] || officeId || '')
      }

      setActivePolygon({
        objectId: polygonObjectId,
        allotmentNumber: allotmentNumber,
        officeId: polygonOfficeId,
        geometry: polygonGeometry
      })

      const tableQuery = reviewTable.createQuery()
      tableQuery.where = buildWhereClause(config.reviewTableIdField || 'ST_ALLOT', allotmentNumber)
      tableQuery.outFields = ['*']
      tableQuery.returnGeometry = false

      const tableResult = await reviewTable.queryFeatures(tableQuery)
      const tableFeature = tableResult.features[0]

      if (!tableFeature) {
        setActiveTableRecord(null)
        setDecision('')
        setRejectComments('')
        setStatusMessage('Polygon found, but no matching review table record was found.')
        return
      }

      const tableAttributes = tableFeature.attributes || {}
      const existingDecision = String(tableAttributes[config.decisionField || 'DECISION'] || '')
      const existingComments = String(tableAttributes[config.commentsField || 'Comments'] || '')

      setActiveTableRecord({
        objectId: String(tableAttributes.OBJECTID || ''),
        decision: existingDecision,
        comments: existingComments
      })

      if (existingDecision === 'Approve' || existingDecision === 'Reject') {
        setDecision(existingDecision)
      } else {
        setDecision('')
      }

      setRejectComments(existingComments)
      setStatusMessage('Review target loaded.')
    } catch (error) {
      console.error(error)
      setStatusMessage('Failed to load the review target.')
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

  async function submitDecision() {
    if (!reviewTable || !activeTableRecord) {
      setStatusMessage('No review table record is ready to update.')
      return
    }

    if (!decision) {
      setStatusMessage('Select Approve or Reject first.')
      return
    }

    if (decision === 'Reject' && !rejectComments.trim()) {
      setStatusMessage('Enter a rejection reason before saving.')
      return
    }

    setIsLoading(true)
    setStatusMessage('Saving review decision...')

    try {
      const updateFeature = {
        attributes: {
          OBJECTID: Number(activeTableRecord.objectId),
          [config.decisionField || 'DECISION']: decision,
          [config.commentsField || 'Comments']: decision === 'Reject' ? rejectComments : ''
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
          comments: decision === 'Reject' ? rejectComments : ''
        })
        setStatusMessage('Review decision saved.')
      } else {
        setStatusMessage('The review decision could not be saved.')
      }
    } catch (error) {
      console.error(error)
      setStatusMessage('Failed to save the review decision.')
    } finally {
      setIsLoading(false)
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
          <div><strong>Allotment:</strong> {activePolygon?.allotmentNumber || urlState.allotmentNumber || 'Not set'}</div>
          <div><strong>Office ID:</strong> {activePolygon?.officeId || urlState.officeId || 'Not set'}</div>
          <div><strong>Application Name:</strong> {urlState.appName || 'Not set'}</div>
          <div><strong>Application Number:</strong> {urlState.appNumber || 'Not set'}</div>
          <div><strong>Task ID:</strong> {urlState.taskId || 'Not set'}</div>
        </div>

        <div className='reviewer-section'>
          <label htmlFor='review-decision'><strong>Review Decision</strong></label>
          <select
            id='review-decision'
            className='review-select'
            value={decision}
            onChange={(event) => setDecision(event.target.value as ReviewDecision)}
          >
            <option value=''>Select a decision</option>
            <option value='Approve'>Approve</option>
            <option value='Reject'>Reject</option>
          </select>

          {decision === 'Reject' ? (
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
          <div><strong>Current Table Decision:</strong> {activeTableRecord?.decision || 'None'}</div>
          <div><strong>Current Comments:</strong> {activeTableRecord?.comments || 'None'}</div>
          <div className='status-text'>{statusMessage}</div>
        </div>

        <div className='button-row'>
          <button className='review-button' onClick={submitDecision} disabled={isLoading}>
            {isLoading ? 'Working...' : 'Submit Review'}
          </button>
          <button className='review-button secondary' onClick={handleClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default Widget
