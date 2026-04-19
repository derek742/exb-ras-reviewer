import { React, type AllWidgetProps } from 'jimu-core'
import React, { useState, useEffect, useRef } from 'react'
import { type IMConfig } from '../config'
import { Button } from 'reactstrap'
import './app.css'
import AcceptModal from './modals/acceptmodal'
import RejectModal from './modals/rejectmodal'
import 'bootstrap/dist/css/bootstrap.min.css'
import FeatureLayer from '@arcgis/core/layers/FeatureLayer'

import * as geoprocessor from '@arcgis/core/rest/geoprocessor.js'
import Color from 'color'
import { JimuMap } from 'jimu-ui/advanced/map'
import { JimuMapViewComponent, type JimuMapView } from 'jimu-arcgis'
import OAuthInfo from "@arcgis/core/identity/OAuthInfo.js";
import IdentityManager from "@arcgis/core/identity/IdentityManager.js";
import Portal from "@arcgis/core/portal/Portal.js";

type downloadType = {
  module: string
  infile: string
}

const Widget = (props: AllWidgetProps<IMConfig>) => {
  const [appMessage, setAppMessage] = useState('PAL')
  const [records, setRecords] = useState('1')
  const [isAccept, setIsAccept] = useState(null)
  const [isReject, setIsReject] = useState(null)

  const [appName, setAppName] = useState('')
  const [taskId, setTaskId] = useState('')
  const [appType, setAppType] = useState('')
  const [appNumber, setAppNumber] = useState('')
  const [isSuccessful, setIsSuccessful] = useState('')
  const [message, setMessage] = useState('')
  const [messageclassName, setMessageclassName] = useState('')
  const [jimuMapView, setJimuMapView] = useState<JimuMapView>()
  const layer = useRef(new FeatureLayer())


    // SET OAuth 2 & portal
    const info = new OAuthInfo({
      appId: 'YAFmhFZoCR5RzF6w',
      popup: true,
      flowType: 'authorization-code',
      portalUrl: 'https://gis.test.blm.doi.net/portal/'
    })
    IdentityManager.registerOAuthInfos([info])
 
    const portal = new Portal({
      url: 'https://gis.test.blm.doi.net/portal/'
    })
 
    portal.load().then((p: Portal) => {
      console.log(p)
      // this.setState({
      //   userName: p.user?.fullName,
      //   userEmail: p.user?.email
      // })
 
      //Fetch Symbols
      p.queryItems({ query: "id: 97fef03068a74ece9d7762d9ac83e8eb" }).then(d => {
        const item = d.results[0]
 
        console.log('symmmddddddddmmmmmmbolitem', item)
 
        item.fetchData().then(data => {
          console.log('daaaaaaada', data?.items[0])
        })
 
        // const testSymbol = new WebStyleSymbol({
        //   name: 'Bench',
        //   portal: item.portal,
        //   styleName: item.title
        //   // styleUrl: item.itemUrl
        // })
 
        // console.log('symmmddddddddmmmmmmbol', testSymbol)
 
        // testSymbol.fetchSymbol().then(symbolData => {
        //   console.log('symmmmmxxxxxmmmmbol', symbolData)
        // }).catch(error => {
        //   console.log('symmmmmmmmxxxmbol error', error)
        // })
 
      }).catch(error => {
        console.log('symmmmmmmmmbol error', error)
      })
 
 
    })

 /** ADD: **/
const activeViewChangeHandler = (jmv: JimuMapView) => {
  if (jmv) {
    setJimuMapView(jmv)
    addFeatureLayer()
    // addLayer()
  }
}


  // url parameters coming from raptor to accept or reject
  // https://permits.test.blm.doi.net:8111/gis-data-review/?raptorType=PAL&appNumber=2024-00474&appName=derek%20test&taskId=62109

  // const addLayer = () => {
    // layer.current = new FeatureLayer({
    //   url: 'https://gis.test.blm.doi.net/arcgis/rest/services/Facility/BLM_Natl_FAMS_PointLocations/MapServer/1',
    //   editingEnabled: true,
    //   popupEnabled: true
    // })



  

  

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const appName = params.get('appName')
    const raptorType = params.get('raptorType')
    const Id = params.get('taskId')
    const appNumber = params.get('appNumber')

    setAppName(appName)
    setAppType(raptorType)
    setTaskId(Id)
    setAppNumber(appNumber)
    // console.log('ActionType is:', action)
    // console.log('raptor Type is:', raptorType)
    // console.log('taskId:', Id)
    // console.log('appNumber is:', appNumber)
  }, [])

  // const runQuery = () => {

  useEffect(() => {
    let query;
    query = layer.current.createQuery()
    query.where = `Version_NM = 'test0701_12'`
    // query.where = `Version_NM='${appNumber}'`
    query.returnGeometry = true

    layer.current.queryFeatures(query).then( function(result) {
     console.log(result.features)
    //  view.goTo({
    //   target: result.features
    //  })

    }).catch(function (error) {
      console.log('Error querying feature service.')
    })
  },[layer.current])
// }

  const toggleAcceptModal = () => setIsAccept(!isAccept)
  const toggleRejectModal = () => setIsReject(!isReject)

  const openRejectModal = () => {
    setIsAccept(false)
    setIsReject(true)
    console.log('open reject modal')
  }

  const handleClose = () => {
    window.history.back()
    console.log('close')
  }

const addFeatureLayer = () => {
    // *** ADD ***
  // create a new FeatureLayer
  if (jimuMapView) {
  const layer = new FeatureLayer({
    url: 'https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/Trailheads_Styled/FeatureServer/0'
  })

  // Add the layer to the map (accessed through the Experience Builder JimuMapView data source)
  jimuMapView?.view.map.add(layer)
}
 }

  const acceptWorkflow = () => {
    //ACCEPT
    const params = { inVersionName: appNumber, flgApprove: true, codedVal: 'RaPt0r4eVer' }
    // let params = { inVersionName: urlParamsRaptor.appNumber, flgApprove: true, codedVal: widgetContext.appConfig.codedValueforApproveReject }

    const gpUrl = 'https://gis.dev.blm.doi.net/arcgisauthpub/rest/services/RAPTOR/BLM_Natl_ApproveReject/GPServer/ApproveReject_RaptorData/submitJob'
    // let gp = new Geoprocessor()
    //gp.setUpdateDelay(600000);
    geoprocessor.submitJob(gpUrl, params)
    function statusCallback(jobInfo) {
      console.log(jobInfo)
      // geoprocessor.cancelJobStatusUpdates(jobInfo.jobId)
    }
    function completeCallback(jobInfo) {
      console.log(jobInfo.jobStatus)
    }
}

  const rejectWorkflow = () => {
    const rejectReason = prompt('Enter the reason for the data rejection \n (Reason will be sent to the Permittee and audit log):', '')

    if (rejectReason === '' || rejectReason == null) {
      alert('BLM must provide a reason to the user for rejecting the data.')
      return false
    }
    const params = { inVersionName: appNumber, flgApprove: true, codedVal: 'RaPt0r4eVer' }
    // let params = { inVersionName: urlParamsRaptor.appNumber, flgApprove: true, codedVal: widgetContext.appConfig.codedValueforApproveReject }

    const gpUrl = 'https://gis.dev.blm.doi.net/arcgisauthpub/rest/services/RAPTOR/BLM_Natl_ApproveReject/GPServer/ApproveReject_RaptorData/submitJob'
    // let gp = new Geoprocessor()
    //gp.setUpdateDelay(600000);
    geoprocessor.submitJob(gpUrl, params)
    function statusCallback(jobInfo) {
      //console.log(jobInfo);
      // gp.cancelJobStatusUpdates(jobInfo.jobId)
    }
    function completeCallback(jobInfo) {
      console.log(jobInfo.jobStatus)
    }
    return true
  }

  function getCookie (cname) {
    const name = cname + '='
    const decodedCookies = decodeURIComponent(document.cookie)
    console.log(document.cookie)
    const ca = decodedCookies.split(';')
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i]
      while (c.charAt(0) === ' ') {
        c = c.substring(1)
      }
      if (c.indexOf(name) === 0) {
        return c.substring(name.length, c.length)
      }
    }
    return ''
  }

  useEffect(() => {
    if (appType === 'SCI') {
      setAppMessage('Science locality Point Records.')
    } else if (appType === 'PAL') {
      setAppMessage('Paleo locality Point Records.')
    } else {
      setAppMessage('Recreation locality Point Records.')
    }
  }, [appType])

  return (
    <div className="widget-demo jimu-widget m-2">
      {/* <JimuMapViewComponent useMapWidgetId={this.props.useMapWidgetIds?.[0]} onActiveViewChange={activeViewChangeHandler} /> */}
        <div className='reviewer-div' style={{ color: 'white' }}>
            <div>
              <div className='reviewer-container'>
                <h6>Data Review Paleo / Science GIS</h6>
                <div>
                  <label>
                    Authorization Code:
                  </label><br></br>
                  { appNumber }
                  <br></br>
                </div>
                <div>
                  <label>
                    Authorization Name:
                  </label><br></br>
                  { appName }
                  <br></br>
                </div>
                <div>
                  <label>
                    { appMessage }
                  </label><br></br>
                  { records }
                  <br></br>
                </div>
              </div>
            </div>
          </div>
      <div className='d-flex justify-content-around'>
        <div style={{ paddingTop: '10px' }}>
          { <Button color='primary' onClick={toggleAcceptModal}>Accept Data</Button> }
          { <Button color="primary" onClick={toggleRejectModal}>Reject Data</Button> }
          <Button color="primary" onClick={handleClose}>Close</Button>
        </div>
      </div>
      <AcceptModal isOpen={isAccept} toggle={toggleAcceptModal} acceptWorkflow = {acceptWorkflow} />
      <RejectModal isOpen={isReject} toggle= {toggleRejectModal} rejectWorkflow={rejectWorkflow} />
    </div>
  )
}

export default Widget
