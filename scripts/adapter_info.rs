fn main(){
 let instance=wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());
 let adapter=pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions{
  power_preference:wgpu::PowerPreference::HighPerformance,..Default::default()
 })).expect("physical GPU adapter");
 let info=adapter.get_info();
 assert_ne!(info.device_type,wgpu::DeviceType::Cpu,"software adapter is not a GPU performance result");
 println!("{}",serde_json::json!({"name":info.name,"backend":format!("{:?}",info.backend),
  "device_type":format!("{:?}",info.device_type),"driver":info.driver,"driver_info":info.driver_info}));
}
